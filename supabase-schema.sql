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


-- Identifiant stable utilisé par le site pour imposer le quiz affiché.
alter table public.quizzes add column if not exists slug text;
create unique index if not exists quizzes_slug_unique_idx on public.quizzes (slug) where slug is not null;

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

-- Quiz diagnostic de français 5e : inséré ou actualisé sans dupliquer le quiz.
do $$
declare
  diagnostic_quiz_id uuid;
begin
  select id into diagnostic_quiz_id from public.quizzes where slug = 'francais-5e-diagnostic' limit 1;

  if diagnostic_quiz_id is null then
    insert into public.quizzes (slug, title, week_label, level, subject, active)
    values ('francais-5e-diagnostic', 'Diagnostic français 5e', 'Compétences essentielles', '5e', 'francais', true)
    returning id into diagnostic_quiz_id;
  else
    update public.quizzes
    set title = 'Diagnostic français 5e', week_label = 'Compétences essentielles', level = '5e', subject = 'francais', active = true
    where id = diagnostic_quiz_id;
    delete from public.questions where quiz_id = diagnostic_quiz_id;
  end if;

  insert into public.questions (quiz_id, prompt, explanation, choices, correct_index, position) values
    (diagnostic_quiz_id, 'Lis : « Malgré la pluie, Lina poursuit sa route car elle veut arriver avant la nuit. » Pourquoi Lina continue-t-elle ?', 'Le connecteur « car » donne la cause : elle souhaite arriver avant la nuit.', '["Elle aime marcher sous la pluie","Elle veut arriver avant la nuit","Elle s’est perdue","Elle attend quelqu’un"]'::jsonb, 1, 1),
    (diagnostic_quiz_id, 'Complète : « Les histoires que nous avons ___ étaient passionnantes. »', 'Avec l’auxiliaire avoir, le participe passé s’accorde avec le COD placé avant : « que », qui reprend « les histoires ».', '["lu","lue","lus","lues"]'::jsonb, 3, 2),
    (diagnostic_quiz_id, 'Dans « Le jeune chevalier avance prudemment », quel mot est un adverbe ?', '« Prudemment » précise la manière dont le chevalier avance : c’est un adverbe.', '["jeune","chevalier","avance","prudemment"]'::jsonb, 3, 3),
    (diagnostic_quiz_id, 'Choisis la phrase correctement accordée.', 'Le sujet « les portes » est au pluriel : le verbe et l’adjectif attribut s’accordent au pluriel.', '["Les portes semble fermées.","Les portes semblent fermée.","Les portes semblent fermées.","Les portes sembles fermées."]'::jsonb, 2, 4),
    (diagnostic_quiz_id, 'Complète : « Hier, nous ___ le vieux château. »', 'Au passé composé, le verbe « visiter » se conjugue avec avoir : « nous avons visité ».', '["visitons","avons visité","visiterons","avions visiter"]'::jsonb, 1, 5),
    (diagnostic_quiz_id, 'Dans « Lorsque le soleil se coucha, les voyageurs installèrent leur camp », quelle action a lieu en premier ?', 'Le coucher du soleil déclenche l’installation du camp : il a lieu en premier.', '["Les voyageurs repartent","Le soleil se couche","Les voyageurs installent le camp","Les voyageurs se réveillent"]'::jsonb, 1, 6),
    (diagnostic_quiz_id, 'Quel mot est le plus proche de « courageux » ?', '« Vaillant » est un synonyme de « courageux ».', '["craintif","vaillant","silencieux","prudent"]'::jsonb, 1, 7),
    (diagnostic_quiz_id, 'Complète : « Il faut que tu ___ attentivement la consigne. »', 'Après « il faut que », on emploie le subjonctif présent : « que tu lises ».', '["lis","liras","lises","lirais"]'::jsonb, 2, 8),
    (diagnostic_quiz_id, 'Quelle phrase contient une proposition subordonnée relative ?', '« qui brillait au loin » complète le nom « phare » et commence par le pronom relatif « qui ».', '["Le phare brillait au loin.","Nous apercevons le phare qui brillait au loin.","Nous apercevons enfin le phare.","Le phare brille et guide les marins."]'::jsonb, 1, 9),
    (diagnostic_quiz_id, 'Choisis la meilleure ponctuation : « Soudain le garçon cria attention un rocher tombe »', 'Les virgules détachent l’adverbe et l’interpellation ; les deux-points introduisent les paroles annoncées.', '["Soudain le garçon cria attention, un rocher tombe.","Soudain, le garçon cria : « Attention, un rocher tombe ! »","Soudain : le garçon cria, attention un rocher tombe.","Soudain le garçon, cria « Attention » un rocher tombe."]'::jsonb, 1, 10);
end $$;
