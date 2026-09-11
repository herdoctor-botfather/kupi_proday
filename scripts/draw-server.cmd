@echo off
rem Запускает ComfyUI - рисовалку, к которой обращается scripts/draw.mjs.
rem
rem Окно надо оставить открытым: пока оно живо, картинки рисуются командой
rem   node scripts\draw.mjs "описание" файл.png
rem
rem --lowvram: у ноутбучной видеокарты 8 ГБ, а модель больше. ComfyUI
rem держит в памяти только работающую часть, подгружая остальное. Медленнее,
rem но иначе не помещается вовсе.
set COMFY=%USERPROFILE%\ComfyUI
"%COMFY%\venv\Scripts\python.exe" "%COMFY%\main.py" --lowvram
