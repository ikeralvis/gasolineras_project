from fastapi import FastAPI
from pymongo import MongoClient

app = FastAPI()

# 🔧 conexión a Mongo
client = MongoClient("mongodb://mongo:27017")
db = client["gasolineras_db"]

@app.get("/")
def root():
    return {"mensaje": "Microservicio de datos funcionando 🚀"}

@app.get("/gasolineras")
def get_gasolineras():
    data = list(db.gasolineras.find({}, {"_id": 0}))
    return data
