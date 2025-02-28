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
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/usr/bin/microsoft-edge'
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
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        button.click();
        button.dispatchEvent(new Event('click', { bubbles: true }));
        console.log('Botão Entrar clicado com sucesso');
      } else {
        console.log('Nenhum botão encontrado, mas continuando...');
      }
    });
    await page.screenshot({ path: 'debug_before_navigation.png' });

    console.log('Esperando os resultados carregarem na tela...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    console.log('Sniffando os dados da tela...');
    const resultados = await page.evaluate(() => {
      const data = {};
      data['Local de votação'] = document.querySelector('div.container-detalhes-ov div.data-box:nth-child(1) span.desc')?.textContent.trim() || 'Não encontrado';
      data['Endereço'] = document.querySelector('div.container-detalhes-ov div.data-box:nth-child(2) span.desc')?.textContent.trim() || 'Não encontrado';
      data['Município/UF'] = document.querySelector('div.container-detalhes-ov div.data-box:nth-child(3) span.desc')?.textContent.trim() || 'Não encontrado';
      data['Bairro'] = document.querySelector('div.container-detalhes-ov div.data-box:nth-child(4) span.desc')?.textContent.trim() || 'Não encontrado';
      data['Seção'] = document.querySelector('div.container-detalhes-ov div.lado-ov:nth-child(2) div.data-box:nth-child(1) span.desc')?.textContent.trim() || 'Não encontrado';
      data['País'] = document.querySelector('div.container-detalhes-ov div.lado-ov:nth-child(2) div.data-box:nth-child(2) span.desc')?.textContent.trim() || 'Não encontrado';
      data['Zona'] = document.querySelector('div.container-detalhes-ov div.lado-ov:nth-child(2) div.data-box:nth-child(3) span.desc')?.textContent.trim() || 'Não encontrado';
      data['Localização'] = document.querySelector('div.container-detalhes-ov div.lado-ov:nth-child(2) div.data-box:nth-child(4) span.desc a')?.getAttribute('href') || 'Não encontrado';
      return data;
    });

    console.log('Resultados extraídos:', JSON.stringify(resultados));
    await browser.close();
    res.json({ status: 'success', data: resultados });
  } catch (error) {
    console.log('Erro detectado:', error.message);
    if (browser) await browser.close();
    res.json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
