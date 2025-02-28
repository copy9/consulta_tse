const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.post('/verificar', async (req, res) => {
  const { cpf, nome_mae, data_nascimento } = req.body;

  if (!cpf || !nome_mae || !data_nascimento) {
    return res.status(400).json({ status: 'error', message: 'Preencha todos os campos!' });
  }

  let browser;
  try {
    console.log('Iniciando o navegador...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');

    console.log('Abrindo o site...');
    await page.goto('https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    console.log('Esperando o formulário de login...');
    await page.waitForSelector('#modal > div > div > div.modal-corpo > div.login-form-row > form > input', { timeout: 90000 });

    async function typeSlowly(selector, text) {
      for (const char of text) {
        await page.type(selector, char, { delay: Math.floor(Math.random() * 200) + 100 });
      }
    }

    console.log('Colocando o CPF...');
    await typeSlowly('#modal > div > div > div.modal-corpo > div.login-form-row > form > input', cpf);

    console.log('Colocando o nome da mãe...');
    const inputs = await page.$$('#modal > div > div > div.modal-corpo > div.login-form-row > form > input');
    if (inputs.length < 2) {
      await page.screenshot({ path: 'debug_mae_error.png' });
      throw new Error('Campo Nome da Mãe não encontrado');
    }
    await typeSlowly('#modal > div > div > div.modal-corpo > div.login-form-row > form > input:nth-child(2)', nome_mae);

    console.log('Colocando a data de nascimento...');
    if (inputs.length < 3) {
      await page.screenshot({ path: 'debug_data_error.png' });
      throw new Error('Campo Data de Nascimento não encontrado');
    }
    await typeSlowly('#modal > div > div > div.modal-corpo > div.login-form-row > form > input:nth-child(3)', data_nascimento);

    console.log('Clicando em Entrar...');
    await page.evaluate(() => {
      let button = document.querySelector('#modal > div > div > div.modal-corpo > div.login-form-row > form > div.menu-botoes > button.btn-tse');
      if (!button) button = document.querySelector('button.btn-tse');
      if (!button) button = document.querySelector('button[type="submit"]');
      if (!button) button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar');
      if (!button) button = document.querySelector('button');
      if (button) {
        button.scrollIntoView({ behavior: 'auto', block: 'center' });
        button.click();
        button.dispatchEvent(new Event('click', { bubbles: true }));
      }
    });
    await page.screenshot({ path: 'debug_before_navigation.png' });

    console.log('Esperando os resultados carregarem na tela...');
    await new Promise(resolve => setTimeout(resolve, 120000));

    console.log('Esperando 1 segundo...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Tirando o print...');
    const containerXPath = '/html/body/div[4]/div/div/div/div/app-root/div';
    const container = await page.evaluateHandle((xpath) => {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }, containerXPath);
    if (!container) {
      await page.screenshot({ path: 'debug_no_results.png' });
      throw new Error('Container dos resultados não encontrado');
    }
    let boundingBox;
    try {
      boundingBox = await (container.asElement() ? container.asElement().boundingBox() : container.boundingBox());
    } catch (e) {
      boundingBox = null;
    }
    if (boundingBox) {
      await page.screenshot({
        path: 'resultados.png',
        clip: {
          x: Math.max(0, boundingBox.x),
          y: Math.max(0, boundingBox.y),
          width: Math.min(boundingBox.width, 1920 - boundingBox.x),
          height: Math.min(boundingBox.height, 1080 - boundingBox.y)
        }
      });
    } else {
      await page.screenshot({ path: 'resultados_full.png' });
    }

    console.log('Exibindo o print nos resultados...');
    const base64Image = await page.screenshot({ encoding: 'base64', type: 'png' });
    if (base64Image) {
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(JSON.stringify({ status: 'success', image: base64Image }));
    } else {
      throw new Error('Falha ao gerar a imagem Base64');
    }
    await browser.close();
  } catch (error) {
    console.log('Erro detectado:', error.message);
    if (browser) await browser.close();
    res.setHeader('Content-Type', 'application/json');
    res.status(500).send(JSON.stringify({ status: 'error', message: error.message }));
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
