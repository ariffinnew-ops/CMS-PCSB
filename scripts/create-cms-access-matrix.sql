-- Create cms_access_matrix table (public, no RLS)
CREATE TABLE IF NOT EXISTS public.cms_access_matrix (
  id BIGSERIAL PRIMARY KEY,
  page_path TEXT NOT NULL,
  page_label TEXT NOT NULL,
  project TEXT NOT NULL CHECK (project IN ('PCSB', 'OTHERS')),
  role_l1 TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l1 IN ('EDIT', 'VIEW', 'NONE')),
  role_l2a TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l2a IN ('EDIT', 'VIEW', 'NONE')),
  role_l2b TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l2b IN ('EDIT', 'VIEW', 'NONE')),
  role_l4 TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l4 IN ('EDIT', 'VIEW', 'NONE')),
  role_l5 TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l5 IN ('EDIT', 'VIEW', 'NONE')),
  role_l6 TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l6 IN ('EDIT', 'VIEW', 'NONE')),
  role_l7 TEXT NOT NULL DEFAULT 'NONE' CHECK (role_l7 IN ('EDIT', 'VIEW', 'NONE')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (page_path, project)
);

-- Seed data: PCSB project
INSERT INTO public.cms_access_matrix (page_path, page_label, project, role_l1, role_l2a, role_l2b, role_l4, role_l5, role_l6, role_l7) VALUES
  ('/dashboard',  'Dashboard',      'PCSB', 'EDIT','VIEW','VIEW','VIEW','VIEW','VIEW','VIEW'),
  ('/roster',     'Roster',         'PCSB', 'EDIT','VIEW','VIEW','VIEW','VIEW','NONE','NONE'),
  ('/training',   'Training Matrix','PCSB', 'EDIT','EDIT','VIEW','EDIT','VIEW','NONE','NONE'),
  ('/staff',      'Staff Detail',   'PCSB', 'EDIT','EDIT','VIEW','EDIT','VIEW','NONE','NONE'),
  ('/statement',  'Statement',      'PCSB', 'EDIT','VIEW','NONE','VIEW','VIEW','VIEW','VIEW'),
  ('/financial',  'Financial',      'PCSB', 'EDIT','VIEW','NONE','VIEW','VIEW','VIEW','VIEW'),
  ('/admin',      'Data Manager',   'PCSB', 'EDIT','EDIT','VIEW','VIEW','VIEW','NONE','NONE'),
  ('/users',      'User Mgmt',     'PCSB', 'EDIT','NONE','NONE','NONE','NONE','NONE','NONE'),
  ('/logs',       'Logs',           'PCSB', 'EDIT','NONE','NONE','NONE','NONE','NONE','NONE')
ON CONFLICT (page_path, project) DO NOTHING;

-- Seed data: OTHERS project
INSERT INTO public.cms_access_matrix (page_path, page_label, project, role_l1, role_l2a, role_l2b, role_l4, role_l5, role_l6, role_l7) VALUES
  ('/dashboard',  'Dashboard',      'OTHERS', 'EDIT','VIEW','VIEW','VIEW','VIEW','VIEW','VIEW'),
  ('/roster',     'Roster',         'OTHERS', 'EDIT','VIEW','VIEW','VIEW','VIEW','NONE','NONE'),
  ('/training',   'Training Matrix','OTHERS', 'EDIT','VIEW','EDIT','EDIT','VIEW','NONE','NONE'),
  ('/staff',      'Staff Detail',   'OTHERS', 'EDIT','VIEW','EDIT','EDIT','VIEW','NONE','NONE'),
  ('/statement',  'Statement',      'OTHERS', 'EDIT','NONE','VIEW','VIEW','VIEW','VIEW','VIEW'),
  ('/financial',  'Financial',      'OTHERS', 'EDIT','NONE','VIEW','VIEW','VIEW','VIEW','VIEW'),
  ('/admin',      'Data Manager',   'OTHERS', 'EDIT','VIEW','EDIT','VIEW','VIEW','NONE','NONE'),
  ('/users',      'User Mgmt',     'OTHERS', 'EDIT','NONE','NONE','NONE','NONE','NONE','NONE'),
  ('/logs',       'Logs',           'OTHERS', 'EDIT','NONE','NONE','NONE','NONE','NONE','NONE')
ON CONFLICT (page_path, project) DO NOTHING;
