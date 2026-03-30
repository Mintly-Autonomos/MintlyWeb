# Mintly WEB

Este repositório contém apenas o frontend do Mintly, um assistente financeiro para profissionais autônomos.

## Sobre o projeto

Mintly é uma aplicação web em Angular + TypeScript que ajuda freelancers e autônomos a organizar gastos, planejar orçamentos e controlar finanças de forma simples e direta.

## Tecnologias utilizadas

- Angular 21
- TypeScript
- Angular Material
- CSS com tema Material

## Estrutura principal

- `src/` - código-fonte do aplicativo
- `src/app/` - componentes e rotas Angular
- `public/` - ativos estáticos
- `tsconfig.*.json` - configurações de TypeScript
- `angular.json` - configuração do projeto Angular

## Como rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Inicie o servidor de desenvolvimento:

```bash
npm start
```

3. Acesse no navegador:

```text
http://localhost:4200/
```

## Comandos úteis

- `npm start` - inicia o app em modo de desenvolvimento
- `npm run build` - cria a versão de produção
- `npm run watch` - build em modo desenvolvimento com watch
- `npm test` - executa testes unitários

## Personalização e desenvolvimento

- Para criar novos componentes use o Angular CLI com `ng generate component nome-do-componente`
- Ajuste estilos em `src/styles.css` e arquivos CSS dos componentes
- O ponto de entrada do app é `src/main.ts`

## Contribuição

Contribuições são bem-vindas. Abra issues para bugs ou propostas de melhoria e envie pull requests com novidades.

## Observações

Este README descreve o frontend do Mintly. Se você estiver procurando pelo serviço de backend, verifique o repositório correspondente ou adicione a API separadamente.
