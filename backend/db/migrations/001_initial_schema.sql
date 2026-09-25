CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS recruiters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(50),
    nin VARCHAR(20),
    bvn VARCHAR(20),
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    is_identity_verified BOOLEAN DEFAULT FALSE,
    is_face_verified BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recruiter_id UUID REFERENCES recruiters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    tin_number VARCHAR(100),
    website_url VARCHAR(255),
    address TEXT,
    industry VARCHAR(100),
    is_cac_verified BOOLEAN DEFAULT FALSE,
    is_tin_verified BOOLEAN DEFAULT FALSE,
    is_domain_verified BOOLEAN DEFAULT FALSE,
    corporate_email VARCHAR(255),
    is_corporate_email_verified BOOLEAN DEFAULT FALSE,
    corporate_email_otp VARCHAR(10),
    corporate_email_otp_expires_at TIMESTAMP WITH TIME ZONE,
    is_cac_director_match BOOLEAN DEFAULT FALSE,
    linkage_type VARCHAR(50) DEFAULT 'unverified',
    verification_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_advertisements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recruiter_id UUID REFERENCES recruiters(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255),
    employment_type VARCHAR(50),
    salary_range VARCHAR(100),
    application_url TEXT,
    application_email VARCHAR(255),
    requirements TEXT,
    benefits TEXT,
    deadline DATE,
    data_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, active, closed
    flags JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_ad_id UUID REFERENCES job_advertisements(id) ON DELETE CASCADE,
    pin VARCHAR(20) UNIQUE NOT NULL,
    qr_code_url TEXT NOT NULL,
    qr_code_path TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_lookups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verification_code_id UUID REFERENCES verification_codes(id) ON DELETE CASCADE,
    lookup_ip VARCHAR(50),
    user_agent TEXT,
    lookup_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_ad_id UUID REFERENCES job_advertisements(id) ON DELETE CASCADE,
    reporter_email VARCHAR(255),
    report_reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID NOT NULL, -- recruiter_id or company_id
    target_type VARCHAR(50) NOT NULL, -- 'recruiter' or 'company'
    check_type VARCHAR(100) NOT NULL, -- 'nin', 'cac', 'liveness', etc.
    provider VARCHAR(50) NOT NULL, -- 'dojah', 'whois'
    reference_id VARCHAR(255), -- ID from provider
    raw_response JSONB,
    is_successful BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    actor_id UUID,
    actor_type VARCHAR(50), -- 'recruiter', 'admin', 'system'
    target_id UUID,
    target_type VARCHAR(50),
    details JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Settings
INSERT INTO settings (key, value) VALUES 
('min_domain_age_days', '30'),
('min_face_match_score', '85.0'),
('min_liveness_score', '80.0'),
('verification_validity_days', '90')
ON CONFLICT (key) DO NOTHING;
