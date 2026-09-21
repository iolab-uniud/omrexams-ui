import os
import glob
from fastapi import APIRouter, BackgroundTasks, Query
from omrexams.correct import Correct
from schemas.correct import CorrectRequest
from api.sse import task_manager

router = APIRouter()

DATA_DIR = os.environ.get("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))

class CorrectProgressCallback:
    def __init__(self, task_id: str):
        self.task_id = task_id

    def __call__(self, current: int, total: int, message: str):
        task_manager.update_task(self.task_id, current, total, message)

def run_correct_task(task_id: str, req: CorrectRequest):
    try:
        task_manager.update_task(task_id, 0, 100, 'Inizializzazione correzione...')
        
        work_dir = os.path.join(DATA_DIR, req.working_dir)
        sorted_dir = os.path.join(work_dir, "sorted")
        
        json_files = glob.glob(os.path.join(work_dir, "*.json"))
        if not json_files:
            raise Exception("Nessun file JSON trovato nella directory di lavoro")
        if len(json_files) > 1:
            raise Exception("Trovati multipli file JSON nella directory di lavoro")
        data_filename = json_files[0]
        
        # Determine the output file
        if req.produce_pdf and req.pdf_filename:
            pdf_name = req.pdf_filename
            if not pdf_name.endswith('.pdf'):
                pdf_name += '.pdf'
            corrected_dir = os.path.join(work_dir, "corrected")
            os.makedirs(corrected_dir, exist_ok=True)
            corrected_out = os.path.join(corrected_dir, pdf_name)
        else:
            corrected_out = os.devnull
            
        progress_callback = CorrectProgressCallback(task_id)
        
        corrector = Correct(
            sorted=sorted_dir,
            corrected=corrected_out,
            data_filename=data_filename,
            resolution=300, # Defaulting to 300
            compression=50, # Defaulting to 50 for OpenCV IMWRITE_JPEG_QUALITY
            use_page_answers=False,
            progress_callback=progress_callback
        )
        
        corrector.correct()
        
        # Task completed successfully
        unique_pages = len(set(w[0] for w in corrector.watch_results))
        result_data = {
            "manual_checks_needed": unique_pages
        }
        task_manager.complete_task(task_id, result_data)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        task_manager.fail_task(task_id, str(e))

@router.get("/status")
def get_status(folder: str = Query(None)):
    if not folder:
        return {}
        
    work_dir = os.path.join(DATA_DIR, folder)
    sorted_dir = os.path.join(work_dir, "sorted")
    corrected_dir = os.path.join(work_dir, "corrected")
    
    if not os.path.exists(sorted_dir):
        os.makedirs(sorted_dir)
        
    sorted_files = glob.glob(os.path.join(sorted_dir, "*.png"))
    data_files = [os.path.basename(f) for f in glob.glob(os.path.join(work_dir, "*.json"))]
    if not os.path.exists(corrected_dir):
        os.makedirs(corrected_dir)
    pdf_files = [os.path.basename(f) for f in glob.glob(os.path.join(corrected_dir, "*.pdf"))]
    
    all_files = []
    if os.path.exists(work_dir):
        all_files = [f for f in os.listdir(work_dir) if os.path.isfile(os.path.join(work_dir, f))]
    
    return {
        "has_datafile": len(data_files) > 0,
        "has_sorted_scans": len(sorted_files) > 0,
        "data_files": data_files,
        "pdf_files": pdf_files,
        "all_files": all_files
    }

@router.post("/start")
async def start_correct(req: CorrectRequest, background_tasks: BackgroundTasks):
    task_id = task_manager.create_task()
    background_tasks.add_task(run_correct_task, task_id, req)
    return {"task_id": task_id}
