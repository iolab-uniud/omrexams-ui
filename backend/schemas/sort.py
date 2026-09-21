from pydantic import BaseModel
from typing import Optional, List

class SortRequest(BaseModel):
    working_dir: str
    paper: Optional[str] = "A4"
    clean_sorted: Optional[bool] = False
    selected_scans: List[str]
