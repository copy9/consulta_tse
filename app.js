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

    console.log('Carregando a página do TSE...');
    await page.goto('https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    console.log('Esperando o formulário de login...');
    await page.waitForSelector('input', { timeout: 90000 });

    async function typeSlowly(selector, text) {
      for (const char of text) {
        await page.type(selector, char, { delay: Math.floor(Math.random() * 200) + 100 });
      }
    }

    console.log('Preenchendo CPF...');
    await typeSlowly('input', cpf);

    console.log('Preenchendo Nome da Mãe...');
    const inputs = await page.$$('input');
    if (inputs.length < 2) {
      await page.screenshot({ path: 'debug_mae_error.png' });
      throw new Error('Campo Nome da Mãe não encontrado');
    }
    await typeSlowly('input:nth-child(2)', nome_mae);

    console.log('Preenchendo Data de Nascimento...');
    if (inputs.length < 3) {
      await page.screenshot({ path: 'debug_data_error.png' });
      throw new Error('Campo Data de Nascimento não encontrado');
    }
    await typeSlowly('input:nth-child(3)', data_nascimento);

    console.log('Clicando no botão "Entrar"...');
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
await page.waitForFunction(
  'document.evaluate("//*[@id=\\\'content\\\']/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue !== null',
  { timeout: 120000 }
);

console.log('Esperando 1 segundo...');
await new Promise(resolve => setTimeout(resolve, 1000));

console.log('Extraindo dados dos resultados...');
const results = await page.evaluate(() => {
  const container = document.evaluate('//*[@id="content"]/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (!container) return null;

  const dataBoxes = container.querySelectorAll('.data-box');
  const resultData = {};
  dataBoxes.forEach(box => {
    const label = box.querySelector('.label')?.textContent.trim() || '';
    const desc = box.querySelector('.desc')?.textContent.trim() || '';
    if (label) resultData[label] = desc;
  });
  return resultData;
});

if (!results) {
  await page.screenshot({ path: 'debug_no_results.png' });
  throw new Error('Dados dos resultados não encontrados');
}

console.log('Dados extraídos com sucesso:', results);
res.setHeader('Content-Type', 'application/json');
res.send(JSON.stringify({ status: 'success', data: results }));

    await browser.close();
  } catch (error) {
    console.log('Erro detectado:', error.message);
    if (browser) await browser.close();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ status: 'error', message: error.message }));
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
