-- Rodar no SQL Editor do SEU projeto Supabase existente (convive com outras tabelas)
-- Usa nomes isolados academia_alunos / academia_pagamentos para não bater com outros projetos
create table if not exists academia_alunos (
  id bigint generated always as identity primary key,
  nome text not null,
  dia int not null check (dia between 1 and 31),
  valor numeric not null,
  whats text default '',
  pago boolean default false,
  criado_em timestamptz default now(),
  user_id uuid references auth.users(id),
  pago_mes text default null
);
create table if not exists academia_pagamentos (
  id bigint generated always as identity primary key,
  aluno_id bigint references academia_alunos(id) on delete cascade,
  nome text,
  valor numeric not null,
  data timestamptz default now(),
  mes text not null,
  user_id uuid references auth.users(id)
);

alter table academia_alunos enable row level security;
alter table academia_pagamentos enable row level security;

-- Migração para quem já rodou o SQL antigo (não quebra se já existir):
alter table academia_alunos add column if not exists pago_mes text default null;
alter table academia_alunos add column if not exists user_id uuid references auth.users(id);
alter table academia_pagamentos add column if not exists user_id uuid references auth.users(id);

-- Índices para aguentar 100+ clientes sem lentidão (busca por dono + mês)
create index if not exists idx_academia_alunos_user on academia_alunos(user_id);
create index if not exists idx_academia_pag_user_mes on academia_pagamentos(user_id, mes);
create index if not exists idx_academia_pag_aluno_mes on academia_pagamentos(aluno_id, mes);

drop policy if exists "dono ve seus academia_alunos" on academia_alunos;
drop policy if exists "dono ve seus academia_pagamentos" on academia_pagamentos;
create policy "dono ve seus academia_alunos" on academia_alunos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono ve seus academia_pagamentos" on academia_pagamentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
