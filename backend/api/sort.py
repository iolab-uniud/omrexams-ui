import os
import glob
import shutil
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Query
from typing import List, Dict, Any
from omrexams.sort import Sort
from schemas.sort import SortRequest
from api.sse import task_manager

router = APIRouter()

DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))

class SortProgressCallback:
    def __init__(self, task_id: str):
        self.task_id = task_id

    def __call__(self, current: int, total: int, message: str):
        task_manager.update_task(self.task_id, current, total, message)

def run_sort_task(task_id: str, req: SortRequest):
    try:
        task_manager.update_task(task_id, 0, 100, 'Inizializzazione sort...')
        
        work_dir = os.path.join(DATA_DIR, req.working_dir)
        scans_dir = os.path.join(work_dir, "scans")
        sorted_dir = os.path.join(work_dir, "sorted")
        
        if not os.path.exists(sorted_dir):
            os.makedirs(sorted_dir)

        if req.clean_sorted:
            for f in glob.glob(os.path.join(sorted_dir, "*.png")):
                try:
                    os.remove(f)
                except:
                    pass
        
        # Recover selected pdfs
        scanned_files = [os.path.join(scans_dir, f) for f in req.selected_scans]
        scanned_files = [f for f in scanned_files if os.path.exists(f)]
        if not scanned_files:
            raise Exception("Nessun file PDF selezionato o file non trovati")
            
        json_files = glob.glob(os.path.join(work_dir, "*.json"))
        if not json_files:
            raise Exception("Nessun file JSON trovato nella directory di lavoro")
        if len(json_files) > 1:
            raise Exception("Trovati multipli file JSON nella directory di lavoro")
        datafile_path = json_files[0]
            
        progress_callback = SortProgressCallback(task_id)
        
        sorter = Sort(
            scanned=scanned_files,
            sorted=sorted_dir,
            doublecheck=False, # TODO: possibly make it configurable
            progress_callback=progress_callback
        )
        
        discarded_pages = sorter.sort(paper=req.paper.upper())
        
        # Task completed successfully
        task_manager.complete_task(task_id, result_data={"discarded_pages": discarded_pages})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        task_manager.fail_task(task_id, str(e))


@router.get("/status")
def get_status(folder: str = Query(None)):
    if not folder:
        return {}
    
    work_dir = os.path.join(DATA_DIR, folder)
    scans_dir = os.path.join(work_dir, "scans")
    sorted_dir = os.path.join(work_dir, "sorted")

    if not os.path.exists(scans_dir):
        os.makedirs(scans_dir)
        
    scans_files = glob.glob(os.path.join(scans_dir, "*.pdf"))
    data_files = [os.path.basename(f) for f in glob.glob(os.path.join(work_dir, "*.json"))]
    sorted_pngs = glob.glob(os.path.join(sorted_dir, "*.png"))
    
    return {
        "has_scans": len(scans_files) > 0,
        "scans_count": len(scans_files),
        "scans_files": [os.path.basename(f) for f in scans_files],
        "data_files": data_files,
        "sorted_png_count": len(sorted_pngs)
    }

@router.post("/upload")
async def upload_scan(folder: str = Query(...), file: UploadFile = File(...)):
    work_dir = os.path.join(DATA_DIR, folder)
    scans_dir = os.path.join(work_dir, "scans")
    if not os.path.exists(scans_dir):
        os.makedirs(scans_dir)
        
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Il file deve essere un PDF")
        
    file_path = os.path.join(scans_dir, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"filename": file.filename, "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/start")
async def start_sort(req: SortRequest, background_tasks: BackgroundTasks):
    task_id = task_manager.create_task()
    background_tasks.add_task(run_sort_task, task_id, req)
    return {"task_id": task_id, "data_dir": os.path.join(DATA_DIR, req.working_dir, "sorted")}
