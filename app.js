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
    const button = await page.$('button[type="submit"]') || await page.$('button');
    if (!button) {
      await page.screenshot({ path: 'debug_button_error.png' });
      throw new Error('Botão Entrar não encontrado');
    }
    await page.evaluate(btn => btn.click(), button);
    await page.screenshot({ path: 'debug_before_navigation.png' });

    console.log('Esperando o redirecionamento para a página de resultados...');
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });
    } catch (e) {
      console.log('Navegação demorou demais, continuando mesmo assim...');
      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 segundos pra carregar
    }

    console.log('Esperando o conteúdo da página de resultados carregar...');
    await page.waitForXPath('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div', { timeout: 120000 });

    console.log('Extraindo os resultados...');
    const resultados = await page.evaluate(() => {
      const data = {
        'Local de votação': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[1]/div[1]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado',
        'Endereço': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[1]/div[2]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado',
        'Município/UF': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[1]/div[3]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado',
        'Bairro': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[1]/div[4]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado',
        'Seção': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[2]/div[1]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado',
        'País': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[2]/div[2]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado',
        'Zona': document.evaluate('/html/body/main/div/div/div[3]/div/div/app-root/div/app-onde-votar/div/div[1]/app-box-local-votacao/div/div/div[2]/div[3]/span[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent.trim() || 'Não encontrado'
        // 'Localização' não tem valor direto no span[2], é um link, então deixei fora por enquanto
      };
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
