import webbrowser
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

# Função para rodar o Selenium (mantida intacta, só adicionado headless)
def run_selenium(cpf, nome_mae, data_nascimento):
    global driver
    options = webdriver.ChromeOptions()
    options.add_argument('--start-maximized')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--no-sandbox')
    options.add_argument('--incognito')
    options.add_argument('--headless')  # Adicionado para rodar em segundo plano
    user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    options.add_argument(f'user-agent={user_agent}')

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    actions = ActionChains(driver)

    def wait_and_find_element(driver, by, selector, wait_time=7):
        try:
            return WebDriverWait(driver, wait_time).until(
                EC.presence_of_element_located((by, selector))
            )
        except Exception as e:
            print(f"Elemento não encontrado: {selector}, Erro: {e}")
            return None

    def wait_and_click_element(driver, by, selector, wait_time=7):
        try:
            element = WebDriverWait(driver, wait_time).until(
                EC.element_to_be_clickable((by, selector))
            )
            actions.move_by_offset(random.randint(-100, 100), random.randint(-50, 50)).perform()
            actions.move_to_element(element).click().perform()
            return True
        except Exception as e:
            print(f"Erro ao clicar no elemento {selector}: {e}")
            return False

    def organic_type(element, text):
        if element:
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

    resultados = {}
    try:
        driver.get("https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar")
        print("Aguardando a página carregar...")
        if wait_and_find_element(driver, By.ID, "titulo-cpf-nome"):
            print("Página carregada!")

        aceito_button = wait_and_find_element(driver, By.CSS_SELECTOR, "button.btn")
        if aceito_button:
            if wait_and_click_element(driver, By.CSS_SELECTOR, "button.btn"):
                print("Botão 'Aceito' clicado!")
                time.sleep(random.uniform(0.3, 2.0))
            else:
                print("Não foi possível clicar no botão 'Aceito'.")
        else:
            print("Botão 'Aceito' não encontrado, seguindo normalmente...")

        cpf_input = wait_and_find_element(driver, By.ID, "titulo-cpf-nome")
        nome_mae_input = wait_and_find_element(driver, By.CSS_SELECTOR, "input[formcontrolname='nomeMae']")
        data_nascimento_input = wait_and_find_element(driver, By.ID, "dataNascimento")

        if cpf_input:
            organic_type(cpf_input, cpf)
            print("CPF preenchido.")
        if nome_mae_input:
            organic_type(nome_mae_input, nome_mae)
            print("Nome da mãe preenchido.")
        if data_nascimento_input:
            organic_type(data_nascimento_input, data_nascimento)
            print("Data de nascimento preenchida.")

        print("Aguardando 5-7 segundos para garantir o preenchimento...")
        time.sleep(random.uniform(3.0, 5.0))

        print("Tentando clicar no botão 'Entrar'...")
        botao_entrar = wait_and_find_element(driver, By.CSS_SELECTOR, "button.btn-tse")
        if botao_entrar:
            if botao_entrar.is_enabled() and botao_entrar.is_displayed():
                driver.execute_script("arguments[0].scrollIntoView(true);", botao_entrar)
                time.sleep(1)
                driver.execute_script("arguments[0].click();", botao_entrar)
                print("Botão 'Entrar' clicado com sucesso via JavaScript!")
                time.sleep(random.uniform(0.1, 1.0))
            else:
                print("Botão 'Entrar' não está habilitado ou visível.")
                driver.save_screenshot("erro_botao_entrar_desabilitado.png")
                raise Exception("Botão 'Entrar' não está clicável.")
        else:
            print("Botão 'Entrar' não encontrado. Capturando erro...")
            driver.save_screenshot("erro_botao_entrar.png")
            raise Exception("Falha ao localizar o botão 'Entrar'.")

        if wait_and_find_element(driver, By.XPATH, "//div[contains(text(),'Local de votação')]"):
            print("Resultado carregado!")

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
        return {"status": "error", "message": str(e)}

    finally:
        print("Navegador permanecerá aberto. Feche manualmente ou use Ctrl+C no terminal.")
        if driver:
            driver.quit()

# Rota para exibir a página HTML
@app.route('/')
def index():
    return render_template('index.html')

# Rota para verificar os dados e iniciar a pesquisa
@app.route('/verificar', methods=['POST'])
def verificar():
    global dados_prontos
    cpf = request.form.get('cpf')
    nome_mae = request.form.get('nome_mae')
    data_nascimento = request.form.get('data_nascimento')

    if not cpf or not nome_mae or not data_nascimento:
        return jsonify({"status": "error", "message": "Por favor, preencha todos os campos!"}), 400

    dados_prontos = True
    # Usando threading para busca assíncrona e esperando o resultado
    resultados = [None]
    def run_and_store():
        resultados[0] = run_selenium(cpf, nome_mae, data_nascimento)

    thread = threading.Thread(target=run_and_store, daemon=True)
    thread.start()
    thread.join()  # Espera a busca terminar
    return jsonify(resultados[0])

if __name__ == '__main__':
    url = 'http://localhost:5000'
    webbrowser.open(url)
    app.run(debug=True)

if driver:
    driver.quit()
