# SR ZEZO · TEN-GEN / SETORES

Painel pessoal de controle e premiação dos comandos dos setores do **Exército de Solano** (One State RP).
Usa o **mesmo Supabase do rpcontrol**, com tabelas próprias (`tg_…`), e roda no **GitHub Pages**.

## 1. Criar as tabelas no Supabase (uma vez)
1. Abra o Supabase → projeto do rpcontrol → **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.

## 2. Publicar no GitHub Pages
1. No repositório: **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** → **Save**.
3. Em 1–2 minutos o link aparece no topo da página de Pages.

## 3. Primeiro acesso (importante)
- Entre com o **mesmo nome no jogo e senha do rpcontrol**.
- **A primeira conta que entrar vira a dona do painel.** Entre logo depois de rodar o script.
  Qualquer outra conta vê "Acesso restrito".

## 4. Trazer os dados do painel antigo (claude.ai)
1. No painel antigo: **Ajustes → Copiar backup**.
2. No painel novo: **Ajustes → Importar backup** → cole → **Importar backup**.

## Instalar como app no celular
- **iPhone (Safari):** abra o link → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o link → menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.

## Arquivos
- `index.html`, `style.css`, `app.js`: o painel.
- `config.js`: URL e chave publishable do Supabase (pública por natureza).
- `sw.js`: faz o painel abrir rápido e funcionar como app (os dados sempre vêm do banco).
- `supabase/schema.sql`: tabelas e regras de segurança (só o dono lê e grava).

## Trocar o dono (se precisar)
No SQL Editor: `delete from public.tg_dono;` e entre de novo com a conta certa.
