from flask import Flask, request, render_template, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random
import threading

app = Flask(__name__)

# Variáveis globais para controle da execução
dados_prontos = False
driver = None

# Função principal com Selenium
def run_selenium(cpf, nome_mae, data_nascimento):
    global driver
    options = webdriver.ChromeOptions()
    options.add_argument('--start-maximized')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--no-sandbox')
    options.add_argument('--incognito')
    options.add_argument('--headless')
    user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    options.add_argument(f'user-agent={user_agent}')

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    actions = ActionChains(driver)

    # Funções auxiliares
    def wait_and_find_element(driver, by, selector, wait_time=30):
        return WebDriverWait(driver, wait_time).until(
            EC.presence_of_element_located((by, selector))
        )

    def wait_and_click_element(driver, by, selector, wait_time=30):
        element = WebDriverWait(driver, wait_time).until(
            EC.element_to_be_clickable((by, selector))
        )
        actions.move_by_offset(random.randint(-100, 100), random.randint(-50, 50)).perform()
        actions.move_to_element(element).click().perform()
        return True

    def organic_type(element, text):
        for char in text:
            element.send_keys(char)
            time.sleep(random.uniform(0.05, 0.8))

    def get_text(driver, label):
        try:
            xpath = f"//span[contains(@class, 'label') and contains(text(), '{label}')]/following-sibling::span[contains(@class, 'desc')]"
            element = driver.find_element(By.XPATH, xpath)
            return element.text.strip()
        except Exception:
            return "Não encontrado"

    # Função pra clicar no botão "Entrar"
    def clicar_botao_entrar(driver):
        print("Tentando clicar no botão 'Entrar'...")
        botao_entrar = WebDriverWait(driver, 30).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn-tse[type='submit']"))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", botao_entrar)
        time.sleep(1)
        driver.execute_script("arguments[0].click();", botao_entrar)
        print("Botão 'Entrar' clicado com sucesso via JavaScript!")

    resultados = {}
    try:
        driver.get("https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar")
        print("Aguardando a página carregar...")
        wait_and_find_element(driver, By.ID, "titulo-cpf-nome")
        print("Página carregada!")

        # Botão "Aceito" (se aparecer)
        aceito_button = wait_and_find_element(driver, By.CSS_SELECTOR, "button.btn")
        if aceito_button:
            wait_and_click_element(driver, By.CSS_SELECTOR, "button.btn")
            print("Botão 'Aceito' clicado!")
            time.sleep(random.uniform(0.3, 2.0))

        # Preenchendo os campos
        cpf_input = wait_and_find_element(driver, By.ID, "titulo-cpf-nome")
        nome_mae_input = wait_and_find_element(driver, By.CSS_SELECTOR, "input[formcontrolname='nomeMae']")
        data_nascimento_input = wait_and_find_element(driver, By.ID, "dataNascimento")

        organic_type(cpf_input, cpf)
        print("CPF preenchido.")
        organic_type(nome_mae_input, nome_mae)
        print("Nome da mãe preenchido.")
        organic_type(data_nascimento_input, data_nascimento)
        print("Data de nascimento preenchida.")

        print("Aguardando 3-5 segundos para garantir o preenchimento...")
        time.sleep(random.uniform(3.0, 5.0))

        # Clicando no botão "Entrar"
        clicar_botao_entrar(driver)
        time.sleep(random.uniform(5.0, 10.0))  # Espera pra página de resultados carregar

        # Verificando se os resultados apareceram
        wait_and_find_element(driver, By.XPATH, "//div[contains(text(),'Local de votação')]")
        print("Resultado carregado!")

        # Extraindo os dados
        labels = [
            "Local de votação",
            "Endereço",
            "Município/UF",
            "Bairro",
            "Seção",
            "País",
            "Zona",
            "Localização"
        ]

        for label in labels:
            resultados[label] = get_text(driver, label)

        print("Resultados coletados.")
        return {"status": "success", "data": resultados}

    except Exception as e:
        print(f"Ocorreu um erro: {e}")
        driver.save_screenshot("erro_final.png")
        return {"status": "error", "message": str(e)}

    finally:
        if driver:
            driver.quit()

# Rota pra exibir o formulário
@app.route('/')
def index():
    return render_template('index.html')

# Rota pra verificar os dados
@app.route('/verificar', methods=['POST'])
def verificar():
    global dados_prontos
    cpf = request.form.get('cpf')
    nome_mae = request.form.get('nome_mae')
    data_nascimento = request.form.get('data_nascimento')

    if not cpf or not nome_mae or not data_nascimento:
        return jsonify({"status": "error", "message": "Por favor, preencha todos os campos!"}), 400

    dados_prontos = True
    resultados = [None]
    def run_and_store():
        resultados[0] = run_selenium(cpf, nome_mae, data_nascimento)

    thread = threading.Thread(target=run_and_store, daemon=True)
    thread.start()
    thread.join()
    return jsonify(resultados[0])

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
