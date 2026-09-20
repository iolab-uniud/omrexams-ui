from fastapi import APIRouter, HTTPException
import os
import glob
from tinydb import TinyDB, Query, where
from schemas.associate import BulkAssociateRequest

router = APIRouter()
DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))

@router.get("/exams")
async def get_exams(working_dir: str):
    jsons = [f for f in os.listdir(os.path.join(DATA_DIR, working_dir)) if f.endswith('.json')]
    if not jsons:
        raise HTTPException(status_code=404, detail="File JSON non trovato nella cartella di lavoro")
    data_filename = os.path.join(DATA_DIR, working_dir, jsons[0])
    if not os.path.exists(data_filename):
        raise HTTPException(status_code=404, detail="Datafile non trovato")
    
    exams_list = []
    with TinyDB(data_filename) as db:
        if 'exams' not in db.tables():
            return {"exams": []}
            
        exams = db.table('exams').all()
        sorted_dir = os.path.join(DATA_DIR, working_dir, "sorted")
        
        for exam in exams:
            student_id = str(exam['student_id'])
            fullname = exam.get('fullname', 'Anonimo')
            
            # Find the first sorted page for this student (e.g. 1-1.png)
            first_image = f"{student_id}-1.png"
            image_path = os.path.join(sorted_dir, first_image)
            if os.path.exists(image_path):
                mtime = os.path.getmtime(image_path)
                image_url = f"/api/data/{working_dir}/sorted/{first_image}?t={int(mtime)}"
            else:
                image_url = None
            
            exams_list.append({
                "student_id": student_id,
                "fullname": fullname,
                "image": image_url
            })
                
    return {"exams": exams_list}

@router.get("/students_files")
async def get_students_files():
    students_dir = os.path.join(DATA_DIR, "students")
    if not os.path.exists(students_dir):
        return {"files": []}
    
    files = []
    for ext in ("*.xlsx", "*.xls", "*.csv"):
        for f in glob.glob(os.path.join(students_dir, ext)):
            files.append(os.path.basename(f))
    return {"files": files}

@router.get("/check_sorted")
async def check_sorted_files(working_dir: str):
    sorted_dir = os.path.join(DATA_DIR, working_dir, "sorted")
    if not os.path.exists(sorted_dir):
        return {"has_sorted_files": False}
    
    # Check if there's at least one PNG file
    png_files = glob.glob(os.path.join(sorted_dir, "*.png"))
    return {"has_sorted_files": len(png_files) > 0}

@router.post("/update")
async def update_associations(req: BulkAssociateRequest):
    jsons = [f for f in os.listdir(os.path.join(DATA_DIR, req.working_dir)) if f.endswith('.json')]
    if not jsons:
        raise HTTPException(status_code=404, detail="File JSON non trovato nella cartella di lavoro")
    data_filename = os.path.join(DATA_DIR, req.working_dir, jsons[0])
    if not os.path.exists(data_filename):
        raise HTTPException(status_code=404, detail="Datafile non trovato")
        
    updated_count = 0
    with TinyDB(data_filename) as db:
        if 'exams' not in db.tables():
            raise HTTPException(status_code=404, detail="Tabella exams non trovata")
            
        Exam = Query()
        exams_table = db.table('exams')
        correction_table = db.table('correction')
        
        for assoc in req.associations:
            # Find the exam to update fullname and student_id
            exam = exams_table.get(Exam.student_id == assoc.original_id)
            if not exam:
                exam = exams_table.get(Exam.student_id == int(assoc.original_id))
                
            if exam:
                exam['student_id'] = assoc.new_student_id
                exam['fullname'] = assoc.new_fullname
                exams_table.upsert(exam, Exam.student_id == assoc.original_id)
                updated_count += 1
                
                # If the fix also exists, we update its student_id to maintain consistency
                if 'correction' in db.tables():
                    correction = correction_table.get(Exam.student_id == assoc.original_id)
                    if correction:
                        correction['student_id'] = assoc.new_student_id
                        correction_table.upsert(correction, Exam.student_id == assoc.original_id)
                        
                # IMPORTANT: If you change the student_id, the image sorted in `sorted/` still has the old file name (e.g. "oldID-1.png")
                # However, being only by association, we may want to rename the files or simply keep the old files so as not to break links
                # For simplicity, we rename PNG files if the id has changed
                if str(assoc.original_id) != str(assoc.new_student_id):
                    sorted_dir = os.path.join(DATA_DIR, req.working_dir, "sorted")
                    old_prefix = f"{assoc.original_id}-"
                    new_prefix = f"{assoc.new_student_id}-"
                    for filename in os.listdir(sorted_dir):
                        if filename.startswith(old_prefix) and filename.endswith(".png"):
                            old_path = os.path.join(sorted_dir, filename)
                            new_path = os.path.join(sorted_dir, filename.replace(old_prefix, new_prefix, 1))
                            os.rename(old_path, new_path)

    return {"status": "success", "updated_count": updated_count}
