from fastapi import APIRouter, HTTPException
import os
import glob
from tinydb import TinyDB, Query, where
from schemas.manual import ForceAnswerRequest, ForceAnswersRequest
from omrexams.mark import custom_correction

router = APIRouter()
DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))

@router.get("/scans")
async def get_scans(working_dir: str):
    scans_dir = os.path.join(DATA_DIR, working_dir, "scans")
    if not os.path.exists(scans_dir):
        return {"scans": []}
    files = glob.glob(os.path.join(scans_dir, "*.pdf"))
    return {"scans": [os.path.basename(f) for f in files]}

@router.get("/corrected")
async def get_corrected(working_dir: str):
    corrected_dir = os.path.join(DATA_DIR, working_dir, "corrected")
    if not os.path.exists(corrected_dir):
        return {"corrected": []}
    files = glob.glob(os.path.join(corrected_dir, "*.pdf"))
    return {"corrected": [os.path.basename(f) for f in files]}

@router.get("/corrected_mapping")
async def get_corrected_mapping(working_dir: str, pdf_name: str):
    import json
    json_path = os.path.join(DATA_DIR, working_dir, "corrected", "sidecar", pdf_name + ".json")
    if not os.path.exists(json_path):
        raise HTTPException(status_code=404, detail="Mapping JSON non trovato per questo PDF")
    with open(json_path, "r") as f:
        mapping = json.load(f)
    return {"mapping": mapping}

@router.get("/missing")
async def get_missing(working_dir: str):
    jsons = [f for f in os.listdir(os.path.join(DATA_DIR, working_dir)) if f.endswith('.json')]
    if not jsons:
        raise HTTPException(status_code=404, detail="File JSON non trovato nella cartella di lavoro")
    data_filename = os.path.join(DATA_DIR, working_dir, jsons[0])
    if not os.path.exists(data_filename):
        raise HTTPException(status_code=404, detail="Datafile non trovato")
    
    missing_students = []
    with TinyDB(data_filename) as db:
        if 'exams' not in db.tables():
            return {"missing": []}
            
        exams = db.table('exams').all()
        Correction = Query()
        correction_table = db.table('correction')
        
        for exam in exams:
            student_id = str(exam['student_id'])
            # Check to see if there is a fix
            corr = correction_table.get(Correction.student_id == student_id)
            
            is_doubtful = False
            if corr:
                # Check if there are doubtful answers
                doubtful_arr = corr.get('doubtful', [])
                if any(doubtful_arr):
                    is_doubtful = True

            if not corr or is_doubtful:
                # Find NPCs in data/sorted
                sorted_dir = os.path.join(DATA_DIR, working_dir, "sorted")
                pngs = glob.glob(os.path.join(sorted_dir, f"{student_id}-*.png"))
                pngs = [f"{os.path.basename(p)}?t={int(os.path.getmtime(p))}" for p in pngs]
                missing_students.append({
                    "student_id": student_id,
                    "images": pngs,
                    "is_doubtful": is_doubtful
                })
                
    return {"missing": missing_students}

@router.get("/student_data")
async def get_student_data(working_dir: str, student_id: str):
    jsons = [f for f in os.listdir(os.path.join(DATA_DIR, working_dir)) if f.endswith('.json')]
    if not jsons:
        raise HTTPException(status_code=404, detail="File JSON non trovato nella cartella di lavoro")
    data_filename = os.path.join(DATA_DIR, working_dir, jsons[0])
    if not os.path.exists(data_filename):
        raise HTTPException(status_code=404, detail="Datafile non trovato")
        
    with TinyDB(data_filename) as db:
        Exam = Query()
        Correction = Query()
        
        # Handle student_id as string or int
        exam = db.table('exams').get(Exam.student_id == student_id)
        if not exam:
            exam = db.table('exams').get(Exam.student_id == int(student_id))
            if not exam:
                raise HTTPException(status_code=404, detail="Studente non trovato in exams")
            
        correction = db.table('correction').get(Correction.student_id == student_id)
        
        answers_status = []
        if correction:
            doubtful_arr = correction.get('doubtful', [])
            for i, (q, reference_correct, given) in enumerate(zip(exam['questions'], correction['correct_answers'], correction['given_answers'])): 
                q_size = len(q[3])
                marked = set(given)
                correct = set(reference_correct) & set(given)
                missing = set(reference_correct) - set(given)
                wrong = set(given) - set(reference_correct)
                c = custom_correction(correct, marked, missing, wrong, q_size) 
                is_doubtful = doubtful_arr[i] if i < len(doubtful_arr) else False
                answers_status.append({
                    "question": i + 1,
                    "file": q[0],
                    "marking": float(c[0]),
                    "correct_ref": list(reference_correct),
                    "marked": list(marked),
                    "correct": list(correct),
                    "missing": list(missing),
                    "wrong": list(wrong),
                    "is_doubtful": is_doubtful
                })
        else:
            for i, q in enumerate(exam['questions']):
                answers_status.append({
                    "question": i + 1,
                    "file": q[0],
                    "marking": 0,
                    "correct_ref": list(exam['answers'][i]),
                    "marked": [],
                    "correct": [],
                    "missing": list(exam['answers'][i]),
                    "wrong": [],
                    "is_doubtful": False
                })
                
        return {
            "student_id": student_id,
            "exam_data": exam,
            "correction_data": correction,
            "answers_status": answers_status
        }

@router.post("/force_answer")
async def force_answer(req: ForceAnswerRequest):
    jsons = [f for f in os.listdir(os.path.join(DATA_DIR, req.working_dir)) if f.endswith('.json')]
    if not jsons:
        raise HTTPException(status_code=404, detail="File JSON non trovato nella cartella di lavoro")
    data_filename = os.path.join(DATA_DIR, req.working_dir, jsons[0])
    with TinyDB(data_filename) as db:
        Exam = Query()
        
        exam = db.table('exams').get(Exam.student_id == req.student_id)
        if not exam:
            exam = db.table('exams').get(Exam.student_id == int(req.student_id))
            if not exam:
                raise HTTPException(status_code=404, detail="Studente non trovato in exams")
            
        correction = db.table('correction').get(Exam.student_id == req.student_id)
        if not correction:
            correction = { 
                'student_id': req.student_id, 
                'correct_answers': [list(ans) for ans in exam['answers']],
                'given_answers': [[] for _ in exam['answers']] 
            }
            
        try:
            given = correction['given_answers'][req.question - 1]
            new_given = list(req.given_answers.upper())
            
            question_size = len(exam['questions'][req.question - 1][3])
            new_given_order = [ord(l) - ord('A') for l in new_given]
            
            if any(o not in range(question_size) for o in new_given_order):
                raise HTTPException(status_code=400, detail=f"La domanda ammette risposte da A a {chr(question_size - 1 + ord('A'))}")
                
            correction['given_answers'][req.question - 1] = new_given
            db.table('correction').upsert(correction, where('student_id') == req.student_id)
            return {"status": "success", "message": f"Risposte per la domanda {req.question} aggiornate a {new_given}"}
            
        except IndexError:
            raise HTTPException(status_code=400, detail=f"La domanda {req.question} non esiste per questo studente")

@router.post("/force_answers")
async def force_answers(req: ForceAnswersRequest):
    jsons = [f for f in os.listdir(os.path.join(DATA_DIR, req.working_dir)) if f.endswith('.json')]
    if not jsons:
        raise HTTPException(status_code=404, detail="File JSON non trovato nella cartella di lavoro")
    data_filename = os.path.join(DATA_DIR, req.working_dir, jsons[0])
    with TinyDB(data_filename) as db:
        Exam = Query()
        
        exam = db.table('exams').get(Exam.student_id == req.student_id)
        if not exam:
            exam = db.table('exams').get(Exam.student_id == int(req.student_id))
            if not exam:
                raise HTTPException(status_code=404, detail="Studente non trovato")
            
        correction = db.table('correction').get(Exam.student_id == req.student_id)
        if not correction:
            correction = { 
                'student_id': req.student_id, 
                'correct_answers': [list(ans) for ans in exam['answers']],
                'given_answers': [[] for _ in exam['answers']] 
            }
            
        if len(req.answers_list) != len(exam['questions']):
            raise HTTPException(status_code=400, detail="Il numero di risposte fornite non coincide con le domande dell'esame")
            
        for i, given_ans in enumerate(req.answers_list):
            new_given = list(given_ans.upper())
            question_size = len(exam['questions'][i][3])
            new_given_order = [ord(l) - ord('A') for l in new_given]
            if any(o not in range(question_size) for o in new_given_order):
                raise HTTPException(status_code=400, detail=f"La domanda {i+1} ammette risposte da A a {chr(question_size - 1 + ord('A'))}")
            correction['given_answers'][i] = new_given
            
        db.table('correction').upsert(correction, where('student_id') == req.student_id)
        return {"status": "success"}
