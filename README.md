# 4200CalorieTracker
CMPS - 4200 Calorie and Macro Tracker

## REQUIREMENTS:
Windows
Python installed
Ollama installed and running
Both Qwen models downloaded


## AI Setup (Windows)

The app uses Ollama locally for AI estimations:

`qwen2.5vl:3b` identifies foods and estimates portions from a meal photo.
`qwen2.5:3b` estimates calories, protein, carbohydrates, and fat.

## 1. Install Ollama

Install the latest version here
https://ollama.com/download

## 2. Install Models

Open powershell and run these two commands

```powershell
ollama pull qwen2.5:3b
ollama pull qwen2.5vl:3b
```

Then open Powershell (Admin) and run 

```powershell
ollama list
```
The list should include the two models listed above
## 3. Install Python Dependencies

Navigate to where the project folder is located and run:

```powershell
py -m pip install -r requirements.txt
```

## 4. Starting Application

Start the backend by running:

```powershell
py -m uvicorn server:app --reload
```

Open the application in your browser:

http://127.0.0.1:8000/



