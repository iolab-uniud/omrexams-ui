import os
import glob
import yaml
import shutil
from datetime import datetime as dt
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException
from schemas.generate import GenerateRequest
from pydantic import BaseModel
from state.manager import task_manager
from omrexams.generate import Generate

class QuestionSaveRequest(BaseModel):
    filename: str
    content: str
    append: bool = True

from typing import List
class UpdateCorrectedRequest(BaseModel):
    question_files: List[str]
    datafile: str


class ProgressCallback:
    def __init__(self, task_id):
        self.task_id = task_id
        
    def __call__(self, current, total, message):
        task_manager.update_task(self.task_id, current, total, message)

router = APIRouter()
DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))

@router.get("/config")
def get_config(folder: str):
    config_path = os.path.join(DATA_DIR, folder, "config.yaml")
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    return {}

@router.get("/files")
def get_files():
    questions_dir = os.path.join(DATA_DIR, "questions")
    students_dir = os.path.join(DATA_DIR, "students")
    
    questions = []
    if os.path.isdir(questions_dir):
        questions = [os.path.basename(f) for f in glob.glob(os.path.join(questions_dir, "*.md"))]
        
    students = []
    if os.path.isdir(students_dir):
        students = [os.path.basename(f) for f in glob.glob(os.path.join(students_dir, "*.xls*"))]
        
    working_dirs = []
    jsons_by_dir = {}
    configs_by_dir = {}
    if os.path.exists(DATA_DIR):
        for item in os.listdir(DATA_DIR):
            item_path = os.path.join(DATA_DIR, item)
            if os.path.isdir(item_path) and item not in ["questions", "students", "backup", "configs", "scans", "sorted", "corrected"]:
                jsons = [os.path.basename(f) for f in glob.glob(os.path.join(item_path, "*.json"))]
                yamls = [os.path.basename(f) for f in glob.glob(os.path.join(item_path, "*.yaml"))]
                if jsons or yamls:
                    working_dirs.append(item)
                    jsons_by_dir[item] = jsons
                    if yamls:
                        configs_by_dir[item] = yamls
        
    return {"questions": questions, "students": students, "working_dirs": working_dirs, "jsons_by_dir": jsons_by_dir, "configs_by_dir": configs_by_dir}

@router.post("/upload/question")
async def upload_question(file: UploadFile = File(...)):
    if not file.filename.endswith('.md'):
        raise HTTPException(400, "Solo file markdown ammessi")
    questions_dir = os.path.join(DATA_DIR, "questions")
    os.makedirs(questions_dir, exist_ok=True)
    file_path = os.path.join(questions_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename}

@router.post("/upload/student")
async def upload_student(file: UploadFile = File(...)):
    if not (file.filename.endswith('.xls') or file.filename.endswith('.xlsx')):
        raise HTTPException(400, "Solo file excel ammessi")
    students_dir = os.path.join(DATA_DIR, "students")
    os.makedirs(students_dir, exist_ok=True)
    file_path = os.path.join(students_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename}

@router.post("/questions/save")
def save_question(req: QuestionSaveRequest):
    questions_dir = os.path.join(DATA_DIR, "questions")
    os.makedirs(questions_dir, exist_ok=True)
    if not req.filename.endswith('.md'):
        req.filename += '.md'
    file_path = os.path.join(questions_dir, req.filename)
    mode = 'a' if req.append and os.path.exists(file_path) else 'w'
    with open(file_path, mode, encoding='utf-8') as f:
        # Ensure an empty line before starting to add (if the file exists and is not empty)
        if mode == 'a' and os.path.getsize(file_path) > 0 and not req.content.startswith('\n'):
            f.write('\n')
        f.write(req.content)
    return {"status": "success", "filename": req.filename}

@router.get("/questions/read")
def read_question(filename: str):
    questions_dir = os.path.join(DATA_DIR, "questions")
    if not filename.endswith('.md'):
        filename += '.md'
    file_path = os.path.join(questions_dir, filename)
    if not os.path.exists(file_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return {"status": "success", "filename": filename, "content": content}

@router.post("/questions/update-corrected")
def update_corrected_endpoint(req: UpdateCorrectedRequest):
    try:
        from omrexams.update_corrected import UpdateCorrected
        # question_files are relative to DATA_DIR, like "questions/filename.md"
        # datafile is relative to DATA_DIR, like "exam.json"
        # wait, req.question_files might just be filenames if we assume they're all in questions/
        # let's assume they are filenames and we prepend "questions/"
        q_files = []
        for qf in req.question_files:
            q_files.append(os.path.join(DATA_DIR, "questions", qf))
        
        data_file = os.path.join(DATA_DIR, req.datafile)
        
        updater = UpdateCorrected(q_files, data_file)
        updater.process(dry_run=False)
        return {"status": "success"}
    except Exception as e:
        import logging
        logging.getLogger("omrexams").error(f"Error updating corrected exams: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


def run_generate_task(task_id: str, req: GenerateRequest):
    try:
        config_dict = req.config.model_dump(by_alias=True, exclude_none=True)
        config_dict['basedir'] = DATA_DIR

        import re
        exam_name = req.config.exam.name or "Esame_Generato"
        safe_name = re.sub(r'[<>:"/\\|?*]', '', exam_name).strip()
        working_dir = os.path.join(DATA_DIR, safe_name)
        
        if req.clean_working_dir and os.path.exists(working_dir):
            import shutil
            for filename in os.listdir(working_dir):
                file_path = os.path.join(working_dir, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    pass
                    
        os.makedirs(working_dir, exist_ok=True)
        
        # Create scans/ subdirectory immediately
        os.makedirs(os.path.join(working_dir, "scans"), exist_ok=True)

        if req.save_config:
            config_path = os.path.join(working_dir, "config.yaml")
            with open(config_path, 'w', encoding='utf-8') as f:
                yaml.dump(config_dict, f, allow_unicode=True)

        # Builds the student list: list of tuples (freshman number, fullname) as the core expects
        student_list = []
        if not req.is_anonymous and req.selected_student_file:
            excel_path = os.path.join(DATA_DIR, "students", req.selected_student_file)
            if not os.path.exists(excel_path):
                raise Exception(f"File studenti non trovato: {excel_path}")
            
            import pandas as pd
            skip_rows = 0
            if 'excel' in config_dict and 'data_marker' in config_dict['excel']:
                marker = config_dict['excel']['data_marker'].get('skip_until')
                column = config_dict['excel']['data_marker'].get('on_column', 0)
                skip_rows_config = config_dict['excel']['data_marker'].get('skip_rows', 0)
                if marker:
                    df_marker = pd.read_excel(excel_path, header=None)
                    for i, row in df_marker.iterrows():
                        if str(row[column]).strip() == marker:
                            skip_rows = i + 1
                            break
                elif skip_rows_config:
                    skip_rows = skip_rows_config
            
            df = pd.read_excel(excel_path, skiprows=skip_rows)
            
            # Intelligent auto-detection: skips lines until it finds real headers
            attempts = 0
            while df.columns.astype(str).str.startswith('Unnamed:').all() and attempts < 10:
                skip_rows += 1
                df = pd.read_excel(excel_path, skiprows=skip_rows)
                attempts += 1
                
            df.columns = [str(c).lower().strip() for c in df.columns]
            fields = config_dict['excel']['fields']
            name_col = str(fields.get('name', 'name')).lower().strip()
            surname_col = str(fields.get('surname', 'surname')).lower().strip()
            id_col = str(fields.get('id', 'id')).lower().strip()
            
            missing_cols = []
            if name_col not in df.columns: missing_cols.append(f"Nome ({name_col})")
            if surname_col not in df.columns: missing_cols.append(f"Cognome ({surname_col})")
            if id_col not in df.columns: missing_cols.append(f"Matricola ({id_col})")
            
            if missing_cols:
                raise Exception(f"Errore: Colonne non trovate nel file Excel: {', '.join(missing_cols)}. Colonne rilevate: {', '.join(df.columns)}")
            
            for idx, row in df.iterrows():
                fullname = f"{row[name_col]} {row[surname_col]}"
                matricola = str(row[id_col])
                student_list.append((matricola, fullname))
        else:
            count = req.num_anonymous_exams or 1
            for i in range(count):
                student_list.append((str(i+1), "Anonimo"))

        questions_dir = os.path.join(DATA_DIR, "questions")
        
        try:
            exam_date = dt.strptime(req.date, "%Y-%m-%d")
        except:
            exam_date = dt.now()

        generator = Generate(
            config=config_dict,
            questions=questions_dir,
            output_prefix=os.path.join(working_dir, req.output_prefix),
            students=student_list,
            exam_date=exam_date,
            seed=req.seed,
            split=req.split,
            folded=req.folded,
            rotated=req.rotated,
            dyslexia_count=req.dyslexia_count,
            progress_callback=ProgressCallback(task_id)
        )
        
        generator.process()
        
        from services.backup import backup_exam_json
        backup_exam_json(os.path.join(working_dir, f"{req.output_prefix}.json"))
        
        task_manager.complete_task(task_id)

    except Exception as e:
        import traceback
        traceback.print_exc()
        task_manager.fail_task(task_id, str(e))

@router.post("/start")
def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks):
    import re
    exam_name = req.config.exam.name or "Esame_Generato"
    safe_name = re.sub(r'[<>:"/\\|?*]', '', exam_name).strip()
    
    task_id = task_manager.create_task()
    background_tasks.add_task(run_generate_task, task_id, req)
    return {"task_id": task_id, "data_dir": DATA_DIR, "working_dir": safe_name}
@router.post("/test-layout")
async def test_layout(req: GenerateRequest):
    import asyncio
    try:
        config_dict = req.config.model_dump(by_alias=True, exclude_none=True)
        config_dict['basedir'] = DATA_DIR
        questions_dir = os.path.join(DATA_DIR, "questions")
        
        tmp_dir = os.path.join(DATA_DIR, "tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        output_prefix = os.path.join(tmp_dir, req.output_prefix)
        
        def run_test():
            generator = Generate(
                config=config_dict,
                questions=questions_dir,
                output_prefix=output_prefix,
                test=True
            )
            generator.process()
            
        await asyncio.to_thread(run_test)
        
        # Return a cache-busting timestamp to avoid caching issues with the PDF
        import time
        timestamp = int(time.time())
        return {"pdf_url": f"/api/data/tmp/{req.output_prefix}.pdf?t={timestamp}"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
