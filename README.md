# Bitcoin Bity Price

Extensão para Chrome que mostra a cotação do Bitcoin no [BitPreço](https://bitpreco.com) direto na barra de ferramentas, com carteira e alertas de preço.

## Funcionalidades

- **Badge no ícone** com o preço atualizado a cada minuto (configurável: preço, valor da carteira ou variação de 24h), verde/vermelho conforme a variação do dia
- Exibição em **BRL ou USD** (conversão via USDT-BRL do próprio BitPreço)
- **Máx/mín de 24h e preços de compra/venda** (spread) do BitPreço
- **Minha carteira**: informe a quantidade de BTC e o total pago para acompanhar o valor atual, o lucro/prejuízo desde a compra e o resultado do dia — com botão para ocultar os valores
- **Alertas de preço**: quantos quiser; notificação do sistema quando o alvo é atingido, mesmo com o popup fechado
- **Gráfico de histórico** (1H / 24H / 7D) com cache local para abrir instantaneamente — dados da Binance, já que o BitPreço não oferece API de candles

## Instalação (modo desenvolvedor)

1. Baixe/clone este repositório
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação** e aponte para a pasta do projeto

## Arquivos

| Arquivo | Função |
|---|---|
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `background.js` | Service worker: busca preços a cada 1 min (`chrome.alarms`), atualiza o badge e dispara alertas |
| `popup.html` / `popup.css` / `popup.js` | Interface do popup |
| `chart.js` | Biblioteca [Chart.js](https://www.chartjs.org/) v4 (bundle local) |
| `icon16/32/48/128.png` | Ícones |

## Fontes de dados

- **Preços, variação 24h, máx/mín e compra/venda**: API pública do BitPreço (`api.bitpreco.com`)
- **Histórico do gráfico**: API pública da Binance (`api.binance.com`)

## Privacidade

Nenhum dado pessoal sai da sua máquina — quantidade da carteira, alertas e preferências ficam apenas no `chrome.storage.local`. Veja [PRIVACY.md](PRIVACY.md).

## Publicar na Chrome Web Store

1. Gere o pacote: compacte `manifest.json`, `background.js`, `popup.*`, `chart.js` e os `icon*.png` em um `.zip` (sem `.git`, README etc.)
2. Crie uma conta de desenvolvedor em https://chrome.google.com/webstore/devconsole (taxa única de US$ 5)
3. Envie o zip, preencha descrição e screenshots do popup, e aponte a política de privacidade
