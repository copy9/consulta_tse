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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 0 // Remove timeout para evitar falhas prematuras
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');

    console.log('Carregando a página do TSE...');
    await page.goto('https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar', {
      waitUntil: 'networkidle2',
      timeout: 70000
    });

    console.log('Esperando o formulário de login...');
    const inputElements = await page.$$('input');
    if (inputElements.length < 3) {
      throw new Error('Número insuficiente de campos de input encontrados');
    }

    console.log('Preenchendo CPF...');
    await page.type('input', cpf, { delay: 100 });

    console.log('Preenchendo Nome da Mãe...');
    await page.type(inputElements[1], nome_mae, { delay: 100 });

    console.log('Preenchendo Data de Nascimento...');
    await page.type(inputElements[2], data_nascimento, { delay: 100 });

    console.log('Clicando no botão "Entrar"...');
    await page.evaluate(() => {
      let button = document.querySelector('button.btn-tse') || document.querySelector('button[type="submit"]');
      if (button) {
        button.click();
      } else {
        throw new Error('Botão "Entrar" não encontrado');
      }
    });

    console.log('Esperando os resultados carregarem...');
    await page.waitForSelector('div.container-detalhes-ov', { timeout: 10000 }).catch(() => {
      throw new Error('Container de resultados não carregou');
    });

    console.log('Capturando print do container de resultados...');
    const container = await page.$('div.container-detalhes-ov');
    if (!container) {
      throw new Error('Container dos resultados não encontrado');
    }
    const boundingBox = await container.boundingBox();
    if (boundingBox) {
      await page.screenshot({
        path: 'resultados.png',
        clip: {
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height
        }
      });
    } else {
      await page.screenshot({ path: 'resultados_full.png' });
    }

    const base64Image = await page.screenshot({ encoding: 'base64', type: 'png' });
    if (base64Image) {
      res.json({ status: 'success', image: base64Image }); // Use res.json diretamente
    } else {
      throw new Error('Falha ao gerar a imagem Base64');
    }
  } catch (error) {
    console.error('Erro detectado:', error.message);
    if (browser) await browser.close();
    res.status(500).json({ status: 'error', message: error.message }); // Garanta resposta JSON em caso de erro
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
