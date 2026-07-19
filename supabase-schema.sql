create extension if not exists pgcrypto;

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  week_label text not null,
  level text not null,
  subject text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  explanation text,
  choices jsonb not null check (jsonb_typeof(choices) = 'array'),
  correct_index integer not null check (correct_index >= 0),
  position integer not null,
  unique (quiz_id, position)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  alias text not null,
  score integer not null,
  total integer not null,
  duration_ms integer not null,
  public_token uuid not null unique,
  created_at timestamptz not null default now()
);

create index if not exists attempts_board_idx
  on public.attempts (quiz_id, score desc, duration_ms asc);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index integer not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists attempt_answers_question_idx
  on public.attempt_answers (question_id);

create index if not exists attempt_answers_attempt_idx
  on public.attempt_answers (attempt_id);

create table if not exists public.attempt_shares (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  share_type text not null check (share_type in ('parent')),
  share_token uuid not null unique default gen_random_uuid(),
  open_count integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (attempt_id, share_type)
);

create index if not exists attempt_shares_attempt_idx
  on public.attempt_shares (attempt_id);

create table if not exists public.parent_leads (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  share_id uuid references public.attempt_shares(id) on delete set null,
  lead_source text not null default 'direct_result',
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  postal_code text,
  callback_requested boolean not null default false,
  callback_requested_at timestamptz,
  email_marketing_consent boolean not null default false,
  email_marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mise à niveau sans perte de données si la table parent_leads existe déjà.
alter table public.parent_leads add column if not exists share_id uuid references public.attempt_shares(id) on delete set null;
alter table public.parent_leads add column if not exists lead_source text not null default 'direct_result';
alter table public.parent_leads add column if not exists postal_code text;
alter table public.parent_leads add column if not exists callback_requested_at timestamptz;
alter table public.parent_leads add column if not exists email_marketing_consent_at timestamptz;
alter table public.parent_leads add column if not exists updated_at timestamptz not null default now();

create index if not exists parent_leads_created_idx
  on public.parent_leads (created_at desc);

create index if not exists parent_leads_source_idx
  on public.parent_leads (lead_source, created_at desc);

create or replace view public.parent_lead_review as
select
  pl.id as lead_id,
  pl.created_at as lead_created_at,
  pl.updated_at as lead_updated_at,
  pl.lead_source,
  pl.parent_name,
  pl.parent_email,
  pl.parent_phone,
  pl.postal_code,
  pl.callback_requested,
  pl.email_marketing_consent,
  a.id as attempt_id,
  a.alias,
  a.score,
  a.total,
  a.duration_ms,
  qz.title as quiz_title,
  qz.week_label,
  qz.level,
  qz.subject,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'position', qu.position,
          'question', qu.prompt,
          'selected_answer', qu.choices ->> aa.selected_index,
          'correct_answer', qu.choices ->> qu.correct_index,
          'explanation', qu.explanation
        )
        order by qu.position
      )
      from public.attempt_answers aa
      join public.questions qu on qu.id = aa.question_id
      where aa.attempt_id = a.id
        and aa.is_correct = false
    ),
    '[]'::jsonb
  ) as mistakes
from public.parent_leads pl
join public.attempts a on a.id = pl.attempt_id
join public.quizzes qz on qz.id = a.quiz_id;

revoke all on table public.quizzes from anon, authenticated;
revoke all on table public.questions from anon, authenticated;
revoke all on table public.attempts from anon, authenticated;
revoke all on table public.attempt_answers from anon, authenticated;
revoke all on table public.attempt_shares from anon, authenticated;
revoke all on table public.parent_leads from anon, authenticated;
revoke all on table public.parent_lead_review from anon, authenticated;

grant select, insert, update, delete on table public.quizzes to service_role;
grant select, insert, update, delete on table public.questions to service_role;
grant select, insert, update, delete on table public.attempts to service_role;
grant select, insert, update, delete on table public.attempt_answers to service_role;
grant select, insert, update, delete on table public.attempt_shares to service_role;
grant select, insert, update, delete on table public.parent_leads to service_role;
grant select on table public.parent_lead_review to service_role;

alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.attempt_shares enable row level security;
alter table public.parent_leads enable row level security;

-- Quiz de démonstration : inséré une seule fois.
do $$
declare
  demo_quiz_id uuid;
begin
  select id into demo_quiz_id
  from public.quizzes
  where title = 'Maths 5e : fractions'
    and week_label = 'Semaine test'
    and level = '5e'
    and subject = 'maths'
  limit 1;

  if demo_quiz_id is null then
    insert into public.quizzes (title, week_label, level, subject, active)
    values ('Maths 5e : fractions', 'Semaine test', '5e', 'maths', true)
    returning id into demo_quiz_id;

    insert into public.questions (quiz_id, prompt, explanation, choices, correct_index, position)
    values
      (demo_quiz_id, 'Combien vaut 1/2 + 1/4 ?', 'On écrit 1/2 sous la forme 2/4, puis 2/4 + 1/4 = 3/4.', '["2/6","3/4","1/6","2/4"]'::jsonb, 1, 1),
      (demo_quiz_id, 'Quelle fraction est égale à 0,5 ?', '0,5 représente une moitié, donc 0,5 = 1/2.', '["1/5","2/5","1/2","5/2"]'::jsonb, 2, 2),
      (demo_quiz_id, 'Combien vaut 3/4 de 20 ?', 'Un quart de 20 vaut 5, donc trois quarts valent 3 × 5 = 15.', '["5","10","15","18"]'::jsonb, 2, 3),
      (demo_quiz_id, 'Quelle fraction est la plus grande ?', '2/3 vaut environ 0,67, ce qui est supérieur aux autres propositions.', '["2/3","3/5","1/2","4/9"]'::jsonb, 0, 4),
      (demo_quiz_id, 'Simplifie 6/8.', 'On divise le numérateur et le dénominateur par 2 : 6/8 = 3/4.', '["3/4","2/3","1/2","6/4"]'::jsonb, 0, 5);
  end if;
end $$;
