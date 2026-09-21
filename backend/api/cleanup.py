from fastapi import APIRouter, HTTPException, Body
import os
import glob
from pydantic import BaseModel
from typing import List

router = APIRouter()

DEFAULT_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DATA_DIR = os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)

class DeleteRequest(BaseModel):
    files: List[str]

@router.get("/files")
def get_files(working_dir: str = None):
    data = {
        "generated_pdfs": [],
        "generated_jsons": [],
        "scans": [],
        "sorted": [],
        "corrected": [],
        "reports": [],
        "config": [],
        "students": [],
        "questions": []
    }

    work_dir = os.path.join(DATA_DIR, working_dir) if working_dir else DATA_DIR
    if not os.path.exists(work_dir):
        return data

    # Generated PDFs: only .pdf directly in DATA_DIR
    for f in glob.glob(os.path.join(work_dir, "*.pdf")):
        data["generated_pdfs"].append(os.path.relpath(f, DATA_DIR))
        
    # Generated JSONs: only .json directly in DATA_DIR
    for f in glob.glob(os.path.join(work_dir, "*.json")):
        data["generated_jsons"].append(os.path.relpath(f, DATA_DIR))
        
    # Scans: all .pdf in DATA_DIR/scans/
    scans_dir = os.path.join(work_dir, "scans")
    if os.path.exists(scans_dir):
        for f in glob.glob(os.path.join(scans_dir, "*.pdf")):
            data["scans"].append(os.path.relpath(f, DATA_DIR))

    # Sorted: all .png in DATA_DIR/sorted/
    sorted_dir = os.path.join(work_dir, "sorted")
    if os.path.exists(sorted_dir):
        for f in glob.glob(os.path.join(sorted_dir, "*.png")):
            data["sorted"].append(os.path.relpath(f, DATA_DIR))

    # Corrected: all .pdf in DATA_DIR/corrected/ and .json in DATA_DIR/corrected/sidecar/
    corrected_dir = os.path.join(work_dir, "corrected")
    if os.path.exists(corrected_dir):
        for f in glob.glob(os.path.join(corrected_dir, "*.pdf")):
            data["corrected"].append(os.path.relpath(f, DATA_DIR))
        sidecar_dir = os.path.join(corrected_dir, "sidecar")
        if os.path.exists(sidecar_dir):
            for f in glob.glob(os.path.join(sidecar_dir, "*.json")):
                data["corrected"].append(os.path.relpath(f, DATA_DIR))

    # Reports: .xlsx and .md in DATA_DIR
    for f in glob.glob(os.path.join(work_dir, "*.xlsx")):
        data["reports"].append(os.path.relpath(f, DATA_DIR))
    for f in glob.glob(os.path.join(work_dir, "*.md")):
        data["reports"].append(os.path.relpath(f, DATA_DIR))

    # Config: .yaml in DATA_DIR
    for f in glob.glob(os.path.join(work_dir, "*.yaml")):
        data["config"].append(os.path.relpath(f, DATA_DIR))
    for f in glob.glob(os.path.join(work_dir, "*.yml")):
        data["config"].append(os.path.relpath(f, DATA_DIR))

    # Students: .xls* in DATA_DIR/students/
    students_dir = os.path.join(DATA_DIR, "students")
    if os.path.exists(students_dir):
        for f in glob.glob(os.path.join(students_dir, "*.xls*")):
            data["students"].append(os.path.relpath(f, DATA_DIR))

    # Questions: .md in DATA_DIR/questions/
    questions_dir = os.path.join(DATA_DIR, "questions")
    if os.path.exists(questions_dir):
        for f in glob.glob(os.path.join(questions_dir, "*.md")):
            data["questions"].append(os.path.relpath(f, DATA_DIR))

    # Fix slashes for windows (use forward slash for frontend consistency)
    for category in data:
        data[category] = [p.replace("\\", "/") for p in data[category]]

    return data

@router.delete("/files")
def delete_files(request: DeleteRequest):
    deleted = []
    errors = []
    
    for relative_path in request.files:
        # Security check: normalize path and ensure it starts with DATA_DIR
        # This prevents Path Traversal like "../../etc/passwd"
        safe_relative = relative_path.replace("\\", "/").lstrip("/")
        abs_path = os.path.abspath(os.path.join(DATA_DIR, safe_relative))
        
        if not abs_path.startswith(os.path.abspath(DATA_DIR)):
            errors.append({"file": relative_path, "error": "Invalid path"})
            continue
            
        if os.path.exists(abs_path) and os.path.isfile(abs_path):
            try:
                os.remove(abs_path)
                deleted.append(relative_path)
            except Exception as e:
                errors.append({"file": relative_path, "error": str(e)})
        else:
            errors.append({"file": relative_path, "error": "File not found"})
            
    return {"deleted": deleted, "errors": errors}
