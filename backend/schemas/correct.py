from pydantic import BaseModel
from typing import Optional

class CorrectRequest(BaseModel):
    working_dir: str
    produce_pdf: bool = False
    pdf_filename: Optional[str] = None
