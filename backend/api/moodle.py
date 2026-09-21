from fastapi import APIRouter, HTTPException, UploadFile, File
import os
import glob

from schemas.moodle import MoodleExportRequest, MoodleImportRequest
from omrexams.moodle_converter import MoodleConverter
from omrexams.markdown_converter import MarkdownConverter

router = APIRouter()

DEFAULT_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DATA_DIR = os.environ.get("DATA_DIR", DEFAULT_DATA_DIR)

DEFAULT_QUESTIONS_DIR = os.path.join(DATA_DIR, "questions")
QUESTIONS_DIR = os.environ.get("QUESTIONS_DIR", DEFAULT_QUESTIONS_DIR)

@router.get("/questions")
def list_questions():
    """Elenca tutti i file markdown nella cartella questions/"""
    if not os.path.exists(QUESTIONS_DIR):
        return {"files": []}
    files = [os.path.basename(f) for f in glob.glob(os.path.join(QUESTIONS_DIR, "*.md"))]
    return {"files": files}

@router.get("/xml_files")
def list_xml_files():
    """Elenca tutti i file xml nella cartella data/"""
    if not os.path.exists(DATA_DIR):
        return {"files": []}
    files = [os.path.basename(f) for f in glob.glob(os.path.join(DATA_DIR, "*.xml"))]
    return {"files": files}

@router.post("/export")
async def export_to_moodle(req: MoodleExportRequest):
    """Converte i file markdown selezionati in un unico (o due) file XML per Moodle"""
    if not req.files:
        raise HTTPException(status_code=400, detail="Nessun file selezionato")
        
    try:
        penalty_val = -abs(req.penalty) if req.penalty else 0
        mc = MoodleConverter(QUESTIONS_DIR, req.single, penalty_val)
        questions = []
        open_questions = []
        
        for f in req.files:
            file_path = os.path.join(QUESTIONS_DIR, f)
            if os.path.exists(file_path):
                questions.extend(mc.load_questions(file_path))
                open_questions.extend(mc.load_open_questions(file_path))
                
        output_path = os.path.join(DATA_DIR, req.outputfile)
        generated_files = []
        
        if questions:
            doc = mc.generate_xml(req.outputfile.split('.')[0], questions)
            doc.write(output_path, xml_declaration=True, encoding='utf-8')
            generated_files.append(req.outputfile)
            
        if open_questions:
            open_output_name = req.outputfile.replace('.xml', '') + '-open.xml'
            if not open_output_name.endswith('.xml'):
                open_output_name += '-open.xml'
            open_output_path = os.path.join(DATA_DIR, open_output_name)
            
            doc_open = mc.generate_xml(req.outputfile.split('.')[0] + "-open", open_questions)
            doc_open.write(open_output_path, xml_declaration=True, encoding='utf-8')
            generated_files.append(open_output_name)
            
        if not generated_files:
            raise HTTPException(status_code=400, detail="Nessuna domanda valida trovata nei file selezionati")
            
        return {
            "status": "success", 
            "message": "Conversione completata con successo.", 
            "files": generated_files, 
            "path": DATA_DIR
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import")
async def import_from_moodle(req: MoodleImportRequest):
    """Converte un file XML di Moodle in database di domande markdown"""
    moodle_file = os.path.join(DATA_DIR, req.xml_file)
    if not os.path.exists(moodle_file):
        raise HTTPException(status_code=404, detail="File XML non trovato")
        
    try:
        if not os.path.exists(QUESTIONS_DIR):
            os.makedirs(QUESTIONS_DIR)
            
        converter = MarkdownConverter(moodle_file, QUESTIONS_DIR, req.output_name)
        
        # We delete the file if it already exists to overwrite it, as the cli does
        if os.path.exists(converter.file_name):
            os.remove(converter.file_name)
            
        converter.convert()
        
        return {
            "status": "success",
            "message": "Domande importate correttamente.",
            "file": os.path.basename(converter.file_name),
            "path": QUESTIONS_DIR
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_xml(file: UploadFile = File(...)):
    """Carica un file XML esterno direttamente nella cartella data/"""
    if not file.filename.endswith('.xml'):
        raise HTTPException(status_code=400, detail="Il file deve avere estensione .xml")
        
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    file_path = os.path.join(DATA_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        return {"status": "success", "message": "File caricato con successo", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
