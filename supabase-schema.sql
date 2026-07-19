create extension if not exists pgcrypto;

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text,
  title text not null,
  week_label text not null,
  level text not null,
  subject text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.quizzes add column if not exists slug text;
create unique index if not exists quizzes_slug_unique_idx
  on public.quizzes (slug) where slug is not null;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  explanation text,
  choices jsonb not null check (jsonb_typeof(choices) = 'array'),
  correct_index integer not null check (correct_index >= 0),
  position integer not null,
  skill_code text,
  skill_label text,
  unique (quiz_id, position)
);

alter table public.questions add column if not exists skill_code text;
alter table public.questions add column if not exists skill_label text;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  alias text not null,
  score integer not null,
  total integer not null,
  duration_ms integer not null,
  public_token uuid not null unique,
  skill_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.attempts
  add column if not exists skill_summary jsonb not null default '[]'::jsonb;

create index if not exists attempts_quiz_created_idx
  on public.attempts (quiz_id, created_at desc);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
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
  lead_status text not null default 'new',
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  main_concern text,
  callback_requested boolean not null default false,
  callback_requested_at timestamptz,
  preferred_contact_time text,
  email_marketing_consent boolean not null default false,
  email_marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration non destructive des anciennes installations.
alter table public.parent_leads add column if not exists share_id uuid references public.attempt_shares(id) on delete set null;
alter table public.parent_leads add column if not exists lead_source text not null default 'direct_result';
alter table public.parent_leads add column if not exists lead_status text not null default 'new';
alter table public.parent_leads add column if not exists main_concern text;
alter table public.parent_leads add column if not exists callback_requested_at timestamptz;
alter table public.parent_leads add column if not exists preferred_contact_time text;
alter table public.parent_leads add column if not exists email_marketing_consent_at timestamptz;
alter table public.parent_leads add column if not exists updated_at timestamptz not null default now();

create index if not exists parent_leads_created_idx
  on public.parent_leads (created_at desc);
create index if not exists parent_leads_status_idx
  on public.parent_leads (lead_status, created_at desc);
create index if not exists parent_leads_source_idx
  on public.parent_leads (lead_source, created_at desc);

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  quiz_id uuid references public.quizzes(id) on delete set null,
  attempt_id uuid references public.attempts(id) on delete set null,
  share_id uuid references public.attempt_shares(id) on delete set null,
  session_id text,
  cta_variant text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists funnel_events_name_created_idx
  on public.funnel_events (event_name, created_at desc);
create index if not exists funnel_events_quiz_created_idx
  on public.funnel_events (quiz_id, created_at desc);
create index if not exists funnel_events_session_idx
  on public.funnel_events (session_id, created_at asc);

drop view if exists public.parent_lead_review;
create view public.parent_lead_review as
select
  pl.id as lead_id,
  pl.created_at as lead_created_at,
  pl.updated_at as lead_updated_at,
  pl.lead_status,
  pl.lead_source,
  pl.parent_name,
  pl.parent_email,
  pl.parent_phone,
  pl.main_concern,
  pl.callback_requested,
  pl.preferred_contact_time,
  pl.email_marketing_consent,
  a.id as attempt_id,
  a.alias,
  a.score,
  a.total,
  a.duration_ms,
  a.skill_summary,
  qz.slug as quiz_slug,
  qz.title as quiz_title,
  qz.week_label,
  qz.level,
  qz.subject,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'position', qu.position,
          'skill_code', qu.skill_code,
          'skill_label', qu.skill_label,
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

drop view if exists public.funnel_event_summary;
create view public.funnel_event_summary as
select
  date_trunc('day', created_at) as event_day,
  event_name,
  coalesce(cta_variant, 'non_renseigne') as cta_variant,
  count(*) as event_count
from public.funnel_events
group by 1, 2, 3
order by 1 desc, 2, 3;

revoke all on table public.quizzes from anon, authenticated;
revoke all on table public.questions from anon, authenticated;
revoke all on table public.attempts from anon, authenticated;
revoke all on table public.attempt_answers from anon, authenticated;
revoke all on table public.attempt_shares from anon, authenticated;
revoke all on table public.parent_leads from anon, authenticated;
revoke all on table public.funnel_events from anon, authenticated;
revoke all on table public.parent_lead_review from anon, authenticated;
revoke all on table public.funnel_event_summary from anon, authenticated;

grant select, insert, update, delete on table public.quizzes to service_role;
grant select, insert, update, delete on table public.questions to service_role;
grant select, insert, update, delete on table public.attempts to service_role;
grant select, insert, update, delete on table public.attempt_answers to service_role;
grant select, insert, update, delete on table public.attempt_shares to service_role;
grant select, insert, update, delete on table public.parent_leads to service_role;
grant select, insert, update, delete on table public.funnel_events to service_role;
grant select on table public.parent_lead_review to service_role;
grant select on table public.funnel_event_summary to service_role;

alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.attempt_shares enable row level security;
alter table public.parent_leads enable row level security;
alter table public.funnel_events enable row level security;

-- Version 2 du diagnostic : nouveau slug afin de préserver les anciennes tentatives.
do $$
declare
  diagnostic_quiz_id uuid;
begin
  select id into diagnostic_quiz_id
  from public.quizzes
  where slug = 'francais-5e-diagnostic-v2'
  limit 1;

  if diagnostic_quiz_id is null then
    insert into public.quizzes (slug, title, week_label, level, subject, active)
    values (
      'francais-5e-diagnostic-v2',
      'Diagnostic français 5e',
      '10 questions · 5 compétences',
      '5e',
      'francais',
      true
    )
    returning id into diagnostic_quiz_id;
  else
    update public.quizzes
    set
      title = 'Diagnostic français 5e',
      week_label = '10 questions · 5 compétences',
      level = '5e',
      subject = 'francais',
      active = true
    where id = diagnostic_quiz_id;
  end if;

  insert into public.questions (
    quiz_id, prompt, explanation, choices, correct_index, position, skill_code, skill_label
  ) values
    (
      diagnostic_quiz_id,
      'Lis : « Malgré la pluie, Lina poursuit sa route car elle veut arriver avant la nuit. » Pourquoi continue-t-elle ?',
      'Le connecteur « car » introduit la cause : Lina souhaite arriver avant la nuit.',
      '["Elle aime marcher sous la pluie","Elle veut arriver avant la nuit","Elle s’est perdue","Elle attend quelqu’un"]'::jsonb,
      1, 1, 'comprehension', 'Compréhension de texte'
    ),
    (
      diagnostic_quiz_id,
      'Lis : « Noé referma doucement la porte. Dans la chambre voisine, le bébé dormait enfin. » Pourquoi agit-il doucement ?',
      'Le texte ne le dit pas directement : on comprend que Noé ne veut pas réveiller le bébé.',
      '["Il a peur de la porte","Il ne veut pas réveiller le bébé","La porte est cassée","Il cherche quelqu’un"]'::jsonb,
      1, 2, 'comprehension', 'Compréhension de texte'
    ),
    (
      diagnostic_quiz_id,
      'Complète : « La plupart des élèves ___ leur matériel. »',
      'Le noyau du groupe sujet est « élèves », au pluriel : on écrit « rangent ».',
      '["range","ranges","rangent","ranger"]'::jsonb,
      2, 3, 'orthographe', 'Orthographe et accords'
    ),
    (
      diagnostic_quiz_id,
      'Complète : « Les histoires que nous avons ___ étaient passionnantes. »',
      'Avec avoir, le participe passé s’accorde avec le COD placé avant : « que » reprend « les histoires ».',
      '["lu","lue","lus","lues"]'::jsonb,
      3, 4, 'orthographe', 'Orthographe et accords'
    ),
    (
      diagnostic_quiz_id,
      'Complète le récit : « Le vent soufflait lorsque le navire ___ soudain à l’horizon. »',
      'L’imparfait décrit la situation (« soufflait ») et le passé simple exprime l’action soudaine : « apparut ».',
      '["apparaissait","apparut","apparaît","apparaîtra"]'::jsonb,
      1, 5, 'conjugaison', 'Conjugaison et temps du récit'
    ),
    (
      diagnostic_quiz_id,
      'Complète : « Il faut que tu ___ attentivement la consigne. »',
      'Après « il faut que », on emploie le subjonctif présent : « que tu lises ».',
      '["lis","liras","lises","lirais"]'::jsonb,
      2, 6, 'conjugaison', 'Conjugaison et temps du récit'
    ),
    (
      diagnostic_quiz_id,
      'Dans « Le jeune chevalier avance prudemment », quel mot est un adverbe ?',
      '« Prudemment » précise la manière dont le chevalier avance : c’est un adverbe.',
      '["jeune","chevalier","avance","prudemment"]'::jsonb,
      3, 7, 'grammaire', 'Grammaire et construction de phrase'
    ),
    (
      diagnostic_quiz_id,
      'Quelle phrase contient une proposition subordonnée relative ?',
      '« qui brillait au loin » complète le nom « phare » et commence par le pronom relatif « qui ».',
      '["Le phare brillait au loin.","Nous apercevons le phare qui brillait au loin.","Nous apercevons enfin le phare.","Le phare brille et guide les marins."]'::jsonb,
      1, 8, 'grammaire', 'Grammaire et construction de phrase'
    ),
    (
      diagnostic_quiz_id,
      'Dans « Après plusieurs échecs, elle persévère », quel mot peut remplacer « persévère » sans changer le sens ?',
      'Persévérer signifie continuer malgré les difficultés.',
      '["abandonne","continue","hésite","oublie"]'::jsonb,
      1, 9, 'vocabulaire_expression', 'Vocabulaire et expression'
    ),
    (
      diagnostic_quiz_id,
      'Choisis la meilleure ponctuation : « Soudain le garçon cria attention un rocher tombe »',
      'La virgule détache « Soudain », les deux-points annoncent les paroles et les guillemets encadrent le discours direct.',
      '["Soudain le garçon cria attention, un rocher tombe.","Soudain, le garçon cria : « Attention, un rocher tombe ! »","Soudain : le garçon cria, attention un rocher tombe.","Soudain le garçon, cria « Attention » un rocher tombe."]'::jsonb,
      1, 10, 'vocabulaire_expression', 'Vocabulaire et expression'
    )
  on conflict (quiz_id, position) do update set
    prompt = excluded.prompt,
    explanation = excluded.explanation,
    choices = excluded.choices,
    correct_index = excluded.correct_index,
    skill_code = excluded.skill_code,
    skill_label = excluded.skill_label;
end $$;
