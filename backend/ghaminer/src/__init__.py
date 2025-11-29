import os

BASE_DIR = os.path.dirname(__file__)
TMP_DIR = os.path.join(BASE_DIR, "tmp")
REPOS_DIR = os.path.join(BASE_DIR, "repos")

os.makedirs(TMP_DIR, exist_ok=True)
os.makedirs(REPOS_DIR, exist_ok=True)
