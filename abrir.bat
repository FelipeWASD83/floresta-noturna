@echo off
rem Abre a floresta: sobe um servidorzinho na porta 4352 e abre o navegador.
rem Fecha esta janela preta quando sair da mata.
rem (Aberto direto do arquivo, o navegador nao deixa carregar os scripts.)
cd /d "%~dp0"
start "" "http://127.0.0.1:4352/"
python -m http.server 4352 --bind 127.0.0.1
