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
    const cpfInput = await Promise.race([
      page.waitForSelector('input#titulo-cpf-nome', { timeout: 90000 }),
      page.waitForSelector('input[formcontrolname="tituloCpfNome"]', { timeout: 90000 }),
      page.waitForSelector('input[type="text"]', { timeout: 90000 })
    ]);
    if (!cpfInput) {
      await page.screenshot({ path: 'debug_form.png' });
      throw new Error('Campo CPF não encontrado na página');
    }

    async function typeSlowly(selector, text) {
      for (const char of text) {
        await page.type(selector, char, { delay: Math.floor(Math.random() * 200) + 100 });
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
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

    console.log('Esperando o conteúdo da página de resultados carregar...');
    await page.waitForSelector('span.label', { timeout: 120000 });

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
        data[label] = labelElement && labelElement.nextElementSibling ? 
          labelElement.nextElementSibling.textContent.trim() : 'Não encontrado';
      });

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
