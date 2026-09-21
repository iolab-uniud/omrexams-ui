from fastapi import APIRouter, HTTPException
from schemas.dashboard import DashboardStatus
import os
import pandas as pd

router = APIRouter()

import glob

# In local development: we dynamically calculate the "data" folder located
# two levels above this file (backend/api/dashboard.py -> ../../data)
DEFAULT_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))

# In Docker: This is automatically set by docker-compose.yaml via env
DATA_DIR = os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)

@router.get("/status", response_model=DashboardStatus)
def get_status():
    config_path = os.path.join(DATA_DIR, "config.yaml")
    questions_dir = os.path.join(DATA_DIR, "questions")
    students_dir = os.path.join(DATA_DIR, "students")

    config_loaded = os.path.exists(config_path)
    
    questions_present = False
    if os.path.isdir(questions_dir):
        # We look for markdown files in the questions folder
        md_files = glob.glob(os.path.join(questions_dir, "*.md"))
        questions_present = len(md_files) > 0
        
    students_present = False
    if os.path.isdir(students_dir):
        # We are looking for excel files in the students folder
        excel_files = glob.glob(os.path.join(students_dir, "*.xls*"))
        students_present = len(excel_files) > 0

    return DashboardStatus(
        config_loaded=config_loaded,
        config_path=config_path if config_loaded else None,
        questions_present=questions_present,
        students_present=students_present
    )

@router.get("/preview_excel")
def preview_excel(filename: str, folder: str = None, headerRows: int = 1, indexCols: int = 0, centerHeaders: bool = False):
    if folder:
        file_path = os.path.join(DATA_DIR, folder, filename)
    else:
        file_path = os.path.join(DATA_DIR, filename)
        
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File non trovato")
    
    try:
        # Load the excel file. If headerRows > 1, pass a list to header to create a MultiIndex
        header_arg = list(range(headerRows)) if headerRows > 1 else 0
        index_arg = list(range(indexCols)) if indexCols > 0 else None
        
        df = pd.read_excel(file_path, header=header_arg, index_col=index_arg)
        
        # Take only the first 10 rows for preview
        df = df.head(10)
        
        # Cleaning up "Unnamed: " columns
        if isinstance(df.columns, pd.MultiIndex):
            def clean_col(c):
                return tuple("" if str(x).startswith("Unnamed:") else x for x in c)
            df.columns = pd.MultiIndex.from_tuples([clean_col(c) for c in df.columns])
        else:
            df.columns = ["" if str(x).startswith("Unnamed:") else x for x in df.columns]
            
        # Cleaning up index names if present and Unnamed
        if df.index.names:
            df.index.names = ["" if str(x).startswith("Unnamed:") else x for x in df.index.names]
        
        # Generate HTML
        # Using standard pandas styling to HTML, empty na_rep
        html_str = df.to_html(classes="w-full text-sm text-left table-auto", border=0, justify="center" if centerHeaders else "left", na_rep="")
        
        return {"html": html_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nella lettura del file: {str(e)}")