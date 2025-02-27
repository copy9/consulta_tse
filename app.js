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

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/108.0.0.0 Safari/537.36');

    console.log('Carregando a página do TSE...');
    await page.goto('https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });

    // Confere se tá na URL correta
    const currentUrl = await page.url();
    console.log('URL atual:', currentUrl);
    if (!currentUrl.includes('https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar')) {
      throw new Error('Redirecionou pra outra página: ' + currentUrl);
    }

    console.log('Esperando o formulário de login...');
    let formFound = false;
    for (let i = 0; i < 6; i++) { // 6 tentativas de 30s = 3 minutos
      try {
        await page.waitForSelector('input#titulo-cpf-nome', { timeout: 30000 });
        formFound = true;
        break;
      } catch (e) {
        console.log(`Tentativa ${i + 1}/6 falhou, esperando mais 30s...`);
        const html = await page.content();
        console.log('HTML atual (primeiros 1000 caracteres):', html.substring(0, 1000));
      }
    }
    if (!formFound) throw new Error('Formulário não encontrado após 3 minutos');

    async function typeSlowly(selector, text) {
      const element = await page.$(selector);
      if (!element) throw new Error(`Elemento ${selector} não encontrado`);
      for (const char of text) {
        await element.type(char, { delay: Math.floor(Math.random() * 200) + 100 });
      }
    }

    console.log('Preenchendo CPF...');
    await typeSlowly('input#titulo-cpf-nome', cpf);

    console.log('Preenchendo Nome da Mãe...');
    await typeSlowly('input[formcontrolname="nomeMae"]', nome_mae);

    console.log('Preenchendo Data de Nascimento...');
    await typeSlowly('input#dataNascimento', data_nascimento);

    console.log('Clicando no botão "Entrar"...');
    await page.click('button.btn-tse');

    console.log('Esperando o redirecionamento para a página de resultados...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 180000 });

    console.log('Esperando o conteúdo da página de resultados carregar...');
    await page.waitForSelector('div.data-box', { timeout: 180000 });

    console.log('Extraindo os resultados...');
    const resultados = await page.evaluate(() => {
      const data = {};
      const labels = [
        'Local de votação',
        'Endereço',
        'Município/UF',
        'Bairro',
        'Seção',
        'País',
        'Zona',
        'Localização',
      ];

      labels.forEach(label => {
        const labelElement = Array.from(document.querySelectorAll('span.label')).find(
          el => el.textContent.trim() === label
        );
        if (labelElement) {
          const valueElement = labelElement.nextElementSibling;
          data[label] = valueElement ? valueElement.textContent.trim() : 'Não encontrado';
        } else {
          data[label] = 'Não encontrado';
        }
      });

      return data;
    });

    console.log('Resultados extraídos com sucesso!');
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
