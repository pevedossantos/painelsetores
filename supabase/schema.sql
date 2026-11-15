-- =====================================================================
--  SR ZEZO · TEN-GEN / SETORES · Exército de Solano
--  Banco do painel de controle e premiação dos comandos dos setores
--
--  Como usar: Supabase → SQL Editor → New query → cole TODO este arquivo → Run.
--  Pode rodar de novo quando o arquivo for atualizado: os dados não se perdem.
--
--  Usa o mesmo projeto Supabase do rpcontrol, com tabelas próprias (prefixo tg_).
--  Segurança: só o DONO do painel lê e grava. O dono é a primeira conta que
--  entrar no painel depois de rodar este script (entre logo em seguida!).
--  As outras contas do rpcontrol não conseguem ver nada daqui.
-- =====================================================================

create extension if not exists pgcrypto;

-- Dono do painel (uma única conta)
create table if not exists public.tg_dono (
  user_id   uuid primary key references auth.users on delete cascade,
  criado_em timestamptz not null default now()
);

-- Critérios de pontuação
create table if not exists public.tg_criterios (
  id      text primary key,
  nome    text not null,
  pontos  int  not null default 0,
  tipo    text not null check (tipo in ('check','count','efetivos')),
  escopo  text not null check (escopo in ('cmd','setor')),
  ordem   int  not null default 0
);
insert into public.tg_criterios (id, nome, pontos, tipo, escopo, ordem) values
  ('pres',  'Presença no evento',          2, 'check',    'cmd',   1),
  ('trein', 'Aplicou treinamento interno', 5, 'count',    'cmd',   2),
  ('pvp',   'Domínio de PvP',              3, 'count',    'cmd',   3),
  ('efet',  'Mais de 3 efetivos ativos',   1, 'efetivos', 'setor', 4),
  ('qru',   'QRUs',                       -5, 'count',    'setor', 5)
on conflict (id) do nothing;

-- Comandos dos setores (1 CMD e 2 CMD)
create table if not exists public.tg_comandos (
  id        uuid primary key default gen_random_uuid(),
  qra       text not null check (length(qra) between 1 and 60),
  dc        text not null default '',
  setor     text not null check (setor in ('Sul','Norte','Centro','Leste')),
  funcao    text not null check (funcao in ('1 CMD','2 CMD')),
  criado_em timestamptz not null default now()
);

-- Lançamentos de pontos (cmd_id vazio = ponto do setor)
create table if not exists public.tg_lancamentos (
  id        uuid primary key default gen_random_uuid(),
  data      date not null default current_date,
  cmd_id    uuid,
  qra       text not null default '',
  setor     text not null,
  funcao    text not null default '',
  crit      text not null,
  crit_nome text not null default '',
  qtd       int  not null default 1,
  pontos    int  not null default 0,
  obs       text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists tg_lancamentos_data_idx on public.tg_lancamentos (data);

-- Prêmios concedidos (um por ciclo de 7 dias)
create table if not exists public.tg_premios (
  id        uuid primary key default gen_random_uuid(),
  cmd_id    uuid,
  qra       text not null default '',
  setor     text not null default '',
  funcao    text not null default '',
  premio    text not null,
  pts       int  not null default 0,
  inicio    date not null,
  fim       date not null,
  obs       text not null default '',
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Segurança (RLS): só o dono
-- ---------------------------------------------------------------------
create or replace function public.tg_sou_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tg_dono where user_id = auth.uid());
$$;

-- Primeiro acesso: a conta logada vira dona se ainda não houver dono.
create or replace function public.tg_acesso() returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'negado'; end if;
  if exists (select 1 from public.tg_dono where user_id = auth.uid()) then return 'dono'; end if;
  lock table public.tg_dono in exclusive mode;
  if not exists (select 1 from public.tg_dono) then
    insert into public.tg_dono (user_id) values (auth.uid());
    return 'dono';
  end if;
  return 'negado';
end $$;

revoke all on function public.tg_acesso() from public, anon;
grant execute on function public.tg_acesso() to authenticated;
grant execute on function public.tg_sou_dono() to authenticated;

alter table public.tg_dono        enable row level security;
alter table public.tg_criterios   enable row level security;
alter table public.tg_comandos    enable row level security;
alter table public.tg_lancamentos enable row level security;
alter table public.tg_premios     enable row level security;

drop policy if exists tg_dono_ver on public.tg_dono;
create policy tg_dono_ver on public.tg_dono for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['tg_criterios','tg_comandos','tg_lancamentos','tg_premios'] loop
    execute format('drop policy if exists %I on public.%I', t || '_dono', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.tg_sou_dono()) with check (public.tg_sou_dono())', t || '_dono', t);
  end loop;
end $$;

grant select, insert, update, delete on public.tg_criterios, public.tg_comandos, public.tg_lancamentos, public.tg_premios to authenticated;
grant select on public.tg_dono to authenticated;
revoke all on public.tg_dono, public.tg_criterios, public.tg_comandos, public.tg_lancamentos, public.tg_premios from anon;
