import os
import glob
from fastapi import APIRouter, HTTPException
from tinydb import TinyDB, Query
import pandas as pd
from tabulate import tabulate

from schemas.mark import CalculateRequest, ReportRequest
from omrexams.mark import Mark, custom_correction, configurable_correction

router = APIRouter()
DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))

@router.get("/questions_list")
async def get_questions_list(working_dir: str):
    work_dir = os.path.join(DATA_DIR, working_dir)
    json_files = glob.glob(os.path.join(work_dir, "*.json"))
    if not json_files:
        raise HTTPException(status_code=404, detail="Datafile JSON non trovato")
    data_filename = json_files[0]
        
    questions = set()
    with TinyDB(data_filename) as db:
        for e in db.table('exams'):
            for q in e['questions']:
                questions.add((q[0], q[1]))
                
    return {"questions": [{"file": q[0], "index": q[1]} for q in sorted(list(questions))]}

@router.post("/calculate")
async def calculate_mark(req: CalculateRequest):
    work_dir = os.path.join(DATA_DIR, req.working_dir)
    json_files = glob.glob(os.path.join(work_dir, "*.json"))
    if not json_files:
        raise HTTPException(status_code=404, detail="Datafile JSON non trovato")
    data_filename = json_files[0]
    
    output_filename = os.path.join(work_dir, req.outputfile)
        
    try:
        marker = Mark(data_filename, output_filename)
        if req.use_custom_weights:
            marking_func = configurable_correction(req.weight_correct, req.weight_wrong, req.weight_missing)
            marker.mark(marking_function=marking_func, include_missing=True)
        else:
            marker.mark(marking_function=custom_correction, include_missing=True)
        return {"status": "success", "message": "Calcolo dei voti completato", "file": req.outputfile, "path": work_dir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/report")
async def generate_report(req: ReportRequest):
    work_dir = os.path.join(DATA_DIR, req.working_dir)
    json_files = glob.glob(os.path.join(work_dir, "*.json"))
    if not json_files:
        raise HTTPException(status_code=404, detail="Datafile JSON non trovato")
    data_filename = json_files[0]
    
    output_filename = os.path.join(work_dir, req.outputfile)
        
    try:
        with TinyDB(data_filename) as db:
            df = pd.DataFrame()
            Exam = Query()
            for exam in db.table('correction').all():
                e = db.table('exams').get(Exam.student_id == exam['student_id'])
                correct_answers = list(map(set, exam['correct_answers']))
                given_answers = list(map(set, exam['given_answers']))
                question_size = list(map(lambda q: len(q[3]), e['questions']))
                for i in range(len(correct_answers)):
                    correct, missing, wrong = correct_answers[i] & given_answers[i], correct_answers[i] - given_answers[i], given_answers[i] - correct_answers[i]
                    df = pd.concat([df, pd.DataFrame([{ 'filename': e['questions'][i][0], 'question': e['questions'][i][1], 'correct_ratio': len(correct) / len(correct_answers[i]), 'missing_ratio': len(missing) / len(correct_answers[i]), 'wrong_ratio': len(wrong) / len(correct_answers[i]), 'options': question_size[i], 'no_correct_answers': len(correct_answers[i]) }])])                    
            if not df.empty:
                df = df.groupby(['filename', 'question']).agg({ 'correct_ratio': ['count', 'sum', 'mean', 'std'], 'missing_ratio': ['mean', 'std'], 'wrong_ratio': ['mean', 'std'], 'options': 'min', 'no_correct_answers': 'min' })
                
                # Writing with xlsxwriter for vertical format on the first column and bold
                writer = pd.ExcelWriter(output_filename, engine='xlsxwriter')
                df.to_excel(writer, sheet_name='Report')
                workbook = writer.book
                worksheet = writer.sheets['Report']
                
                center_bold_format = workbook.add_format({'align': 'center', 'valign': 'vcenter', 'bold': True})
                bold_format = workbook.add_format({'bold': True})
                
                # Applies bold format to column headings
                for row in range(df.columns.nlevels):
                    worksheet.set_row(row, None, center_bold_format)
                
                # Apply bold to the second column of the index (question)
                worksheet.set_column(1, 1, None, bold_format)
                
                vertical_format = workbook.add_format({'rotation': 90, 'align': 'center', 'valign': 'vcenter', 'bold': True})
                worksheet.set_column(0, 0, 10, vertical_format) # Set width 10 and vertical format
                
                # Restore normal orientation for the 'filename' header (at the df.columns.nlevels line)
                normal_format = workbook.add_format({'align': 'center', 'valign': 'vcenter', 'bold': True})
                worksheet.write(df.columns.nlevels, 0, 'filename', normal_format)
                
                writer.close()
            else:
                raise Exception("Nessun dato di correzione presente.")
                
        return {"status": "success", "message": "Report generato", "file": req.outputfile, "path": work_dir}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/review_question")
async def review_question(working_dir: str, question_file: str, question: int, export_format: str = None, output_filename: str = None):
    work_dir = os.path.join(DATA_DIR, working_dir)
    json_files = glob.glob(os.path.join(work_dir, "*.json"))
    if not json_files:
        raise HTTPException(status_code=404, detail="Datafile JSON non trovato")
    data_filename = json_files[0]
        
    try:
        with TinyDB(data_filename) as db:
            students = []
            for e in db.table('exams'):
                for i, q in enumerate(e['questions']):
                    if q[0] == question_file and q[1] == question:
                        students.append((e['student_id'], i))
                        break
            
            table = []
            for student_id, i in students:
                Exam, Correction = Query(), Query()
                exam = db.table('exams').get(Exam.student_id == student_id)    
                correction = db.table('correction').get(Correction.student_id == student_id) 
                if correction is None:
                    continue
                q = exam['questions'][i]
                given = correction['given_answers'][i]
                reference_correct = set(q[2])
                marked = set(given)
                correct = reference_correct & marked
                missing = reference_correct - marked
                wrong = marked - reference_correct
                table.append({
                    "student_id": student_id,
                    "question": i + 1,
                    "file": f"{q[0]} ({q[1]})",
                    "correct_ref": list(reference_correct),
                    "marked": list(marked),
                    "correct": list(correct),
                    "missing": list(missing),
                    "wrong": list(wrong)
                })
            
            if export_format and output_filename:
                out_path = os.path.join(work_dir, output_filename)
                if export_format == 'excel':
                    df = pd.DataFrame(table)
                    # Format arrays as strings for Excel
                    for col in ["correct_ref", "marked", "correct", "missing", "wrong"]:
                        df[col] = df[col].apply(lambda x: ', '.join(x))
                    df.to_excel(out_path, index=False)
                elif export_format == 'markdown':
                    # Preparing textual data for tabulation
                    tab_data = []
                    for row in table:
                        tab_data.append([
                            row["student_id"], row["question"], row["file"], 
                            ', '.join(row["correct_ref"]), ', '.join(row["marked"]), 
                            ', '.join(row["correct"]), ', '.join(row["missing"]), 
                            ', '.join(row["wrong"])
                        ])
                    md_text = tabulate(tab_data, headers=["Student ID", "Question", "File", "Correct Ref", "Marked", "Correct", "Missing", "Wrong"], tablefmt="pipe")
                    with open(out_path, 'w', encoding='utf-8') as f:
                        f.write(md_text)
                
                return {"status": "success", "message": f"Esportato in {output_filename}", "file": output_filename, "path": work_dir, "results": table}

            return {"results": table}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/students_with_question")
async def students_with_question(working_dir: str, question_file: str, question: int, export_format: str = None, output_filename: str = None):
    work_dir = os.path.join(DATA_DIR, working_dir)
    json_files = glob.glob(os.path.join(work_dir, "*.json"))
    if not json_files:
        raise HTTPException(status_code=404, detail="Datafile JSON non trovato")
    data_filename = json_files[0]
        
    try:
        students = []
        with TinyDB(data_filename) as db:
            for e in db.table('exams'):
                for q in e['questions']:
                    if q[0] == question_file and q[1] == question:
                        students.append(e['student_id'])
                        break
        
        
        if export_format and output_filename:
            out_path = os.path.join(work_dir, output_filename)
            if export_format == 'excel':
                df = pd.DataFrame(students, columns=["Student ID"])
                df.to_excel(out_path, index=False)
            elif export_format == 'markdown':
                tab_data = [[s] for s in students]
                md_text = tabulate(tab_data, headers=["Student ID"], tablefmt="pipe")
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write(md_text)
            
            return {"status": "success", "message": f"Esportato in {output_filename}", "file": output_filename, "path": work_dir, "students": students}

        return {"students": students}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
