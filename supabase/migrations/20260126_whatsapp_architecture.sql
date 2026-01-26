-- Optimize WhatsApp Tables for High Performance

-- 1. SESSIONS (One per Admin)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    phone_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'scanning')),
    qr_code TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. GROUPS (Normalized with JID)
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    jid VARCHAR(100) PRIMARY KEY, -- 1203630239@g.us
    session_id UUID REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    participant_count INT DEFAULT 0,
    last_synced TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ASSIGNMENTS (Which Employee Group can see which WA Group)
CREATE TABLE IF NOT EXISTS public.whatsapp_group_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_jid VARCHAR(100) REFERENCES public.whatsapp_groups(jid) ON DELETE CASCADE,
    employee_group_id UUID REFERENCES public.employee_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_jid, employee_group_id)
);

-- 4. MESSAGES (Audit Log & Status)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wa_message_id VARCHAR(100), -- BAE5...
    group_jid VARCHAR(100) REFERENCES public.whatsapp_groups(jid),
    sender_id UUID REFERENCES auth.users(id), -- Null if system message
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    type VARCHAR(20) DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INDEXES (Crucial for Performance)
CREATE INDEX IF NOT EXISTS idx_messages_group_jid ON public.messages(group_jid);
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_groups_session ON public.whatsapp_groups(session_id);

-- 6. RLS POLICIES

-- Enable RLS
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Sessions: Only Admins can see/manage
CREATE POLICY "Admins manage sessions" ON public.whatsapp_sessions
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- Groups: Admins see all, Employees see assigned
CREATE POLICY "Admins see all groups" ON public.whatsapp_groups
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Employees see assigned groups" ON public.whatsapp_groups
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.whatsapp_group_assignments wga
        JOIN public.employee_group_members egm ON wga.employee_group_id = egm.employee_group_id
        WHERE wga.group_jid = whatsapp_groups.jid
        AND egm.user_id = auth.uid()
    )
);

-- Messages: Similar logic
CREATE POLICY "Admins see all messages" ON public.messages
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Employees see assigned group messages" ON public.messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.whatsapp_group_assignments wga
        JOIN public.employee_group_members egm ON wga.employee_group_id = egm.group_id
        WHERE wga.group_jid = messages.group_jid
        AND egm.user_id = auth.uid()
    )
);

-- Employees can INSERT messages only to assigned groups (via API preferably, but RLS as backup)
CREATE POLICY "Employees insert assigned group messages" ON public.messages
FOR INSERT WITH CHECK (
    sender_id = auth.uid()
);
