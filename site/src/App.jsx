import { useState, useEffect } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import { GlitchText, TerminalBlock, StackItem, FeatureList } from './components/ui'

export default function App() {
  const [showHero, setShowHero] = useState(false)
  const [showCards, setShowCards] = useState(false)

  useEffect(() => {
    setTimeout(() => setShowHero(true), 300)
    setTimeout(() => setShowCards(true), 800)
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Removed background grid for solid dark aesthetic */}

      <Header />

      <main style={{ position: 'relative', zIndex: 1, flex: 1 }}>
        {/* Hero */}
        <section style={{
          maxWidth: '1120px', margin: '0 auto',
          padding: '80px 32px 48px',
          opacity: showHero ? 1 : 0,
          transform: showHero ? 'translateY(0)' : 'translateY(16px)',
          transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
            <img src={`${import.meta.env.BASE_URL}red_transparent_perfect.png`} alt="Ansible Forge Hero Logo" style={{ width: '220px', height: 'auto' }} />
          </div>

          <h1 style={{
            fontFamily: 'var(--af-font-display)',
            fontSize: 'clamp(42px, 6vw, 64px)',
            fontWeight: 800, lineHeight: 1.1,
            marginBottom: '32px', color: '#fff',
            textTransform: 'uppercase',
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}>
            A COMPLETE ANSIBLE<br />DEVELOPMENT PLATFORM
          </h1>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '64px' }}>
            <a href="/ansibleforge/docs/getting-started/" style={{
              background: 'var(--af-red)', color: '#fff',
              padding: '14px 36px', fontFamily: 'var(--af-font-display)',
              fontSize: '15px', fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'all 0.2s', textDecoration: 'none',
              borderRadius: '4px', border: '1px solid var(--af-red-dark)'
            }}
              onMouseEnter={(e) => { e.target.style.background = 'var(--af-red-dark)' }}
              onMouseLeave={(e) => { e.target.style.background = 'var(--af-red)' }}
            >
              Explore Features
            </a>
            <a href="https://github.com/hfenner/ansibleforge" target="_blank" rel="noopener noreferrer" style={{
              background: 'transparent', color: '#fff',
              padding: '14px 36px', fontFamily: 'var(--af-font-display)',
              fontSize: '15px', fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', cursor: 'pointer',
              transition: 'all 0.2s', textDecoration: 'none',
              borderBottom: '1px solid #fff'
            }}
              onMouseEnter={(e) => { e.target.style.color = 'var(--af-text-secondary)'; e.target.style.borderBottomColor = 'var(--af-text-secondary)'; }}
              onMouseLeave={(e) => { e.target.style.color = '#fff'; e.target.style.borderBottomColor = '#fff'; }}
            >
              View Demo
            </a>
          </div>

          <TerminalBlock title="GitOps">
            <div>
              <span style={{ color: 'var(--af-blue)' }}>[ansible-forge]</span>{' '}
              <span style={{ color: '#e0e0e0' }}>git pull -q</span>
            </div>
            <div>
              <span style={{ color: 'var(--af-blue)' }}>[ansible-forge]</span>{' '}
              <span style={{ color: '#e0e0e0' }}>ansible-playbook site.yml -i inventory/</span>
            </div>
            <br/>
            <div>
              <span style={{ color: '#e0e0e0' }}>TASK [gathering facts]</span>{' '}
              <span style={{ color: 'var(--af-green)' }}>************* SUCCESS *************</span>
            </div>
            <br/>
            <div>
              <span style={{ color: '#e0e0e0' }}>TASK [deploy app]</span>{' '}
              <span style={{ color: 'var(--af-green)' }}>**************** SUCCESS *************</span>
            </div>
            <br/>
            <div>
              <span style={{ color: '#e0e0e0' }}>RECAP</span>{' '}
              <span style={{ color: 'var(--af-text-secondary)' }}>************************************************</span>
            </div>
            <div>
              <span style={{ color: 'var(--af-text-muted)' }}>{'           '}: </span>
              <span style={{ color: 'var(--af-green)' }}>ok=15</span>{'    '}
              <span style={{ color: 'var(--af-amber)' }}>changed=4</span>{'    '}
              <span style={{ color: 'var(--af-text-secondary)' }}>unreachable=0</span>{'    '}
              <span style={{ color: 'var(--af-amber)' }}>failed=0</span>
            </div>
            <br/>
            <div>
              <span style={{ color: 'var(--af-blue)' }}>[ansible-forge]</span>{' '}
              <span style={{ color: '#e0e0e0' }}>Deployment verified: v1.2.3</span>
            </div>
            <br/>
            <div>
              <span style={{ color: 'var(--af-green)' }}>GITOPS SEQUENCE COMPLETE. [status: SUCCESS]</span>
            </div>
            <br/>
          </TerminalBlock>
        </section>

        <div style={{ maxWidth: '1120px', margin: '40px auto', padding: '0 32px' }}>
          <div style={{ height: '1px', background: 'var(--af-border)' }} />
        </div>

        {/* For developers / For operators */}
        <section style={{
          maxWidth: '1120px', margin: '0 auto', padding: '20px 32px 60px',
          opacity: showCards ? 1 : 0, transition: 'opacity 0.6s ease',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(480px, 100%), 1fr))',
            gap: '24px',
          }}>
            <div style={{ background: 'var(--af-bg-surface)', border: '1px solid var(--af-border)', padding: '32px' }}>
              <div style={{
                fontFamily: 'var(--af-font-mono)', fontSize: '11px',
                color: 'var(--af-red)', letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500,
              }}>For developers</div>
              <FeatureList items={[
                'Browser-based DevSpaces with every Ansible tool pre-loaded',
                'Vault secrets automatically injected — no manual credential setup',
                'Persistent storage and per-user namespace isolation',
                'Ansible dev tools, Terraform, AWS CLI, Helm, Podman, Claude Code',
                '30+ Ansible collections ready to use',
              ]} />
            </div>
            <div style={{ background: 'var(--af-bg-surface)', border: '1px solid var(--af-border)', padding: '32px' }}>
              <div style={{
                fontFamily: 'var(--af-font-mono)', fontSize: '11px',
                color: 'var(--af-red)', letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: '16px', fontWeight: 500,
              }}>For operators</div>
              <FeatureList items={[
                'One ArgoCD bootstrap application deploys the entire stack',
                'HashiCorp Vault auto-initialized and unsealed on first boot',
                'External Secrets Operator with Vault and AWS backends',
                'Per-user provisioning via ApplicationSet — one-line git change',
                'Shared BuildConfigs keeping images fresh in the internal registry',
              ]} />
            </div>
          </div>
        </section>

        {/* What gets deployed */}
        <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 32px 60px' }}>
          <div style={{
            fontFamily: 'var(--af-font-display)', fontSize: '24px',
            fontWeight: 600, color: '#fff', marginBottom: '24px',
          }}>What gets deployed</div>
          <div style={{ background: 'var(--af-bg-surface)', border: '1px solid var(--af-border)', padding: '8px 28px' }}>
            <StackItem label="GitOps" color="var(--af-red)" tools={['ArgoCD', 'App-of-apps bootstrap', 'ApplicationSet']} />
            <StackItem label="Secrets" color="var(--af-amber)" tools={['HashiCorp Vault', 'External Secrets Operator', 'AWS Secrets Manager']} />
            <StackItem label="Dev" color="var(--af-blue)" tools={['DevSpaces', 'tools-ansibleforge container', 'ee-ansibleforge EE']} />
            <StackItem label="Platform" color="var(--af-green)" tools={['AAP Operator', 'Keycloak', 'GitLab', 'OpenShift Pipelines']} />
            <StackItem label="Builds" color="var(--af-text-secondary)" tools={['Shared BuildConfigs', 'ImageStreams', 'Internal registry']} />
          </div>
        </section>

        {/* Repo layout */}
        <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 32px 80px' }}>
          <div style={{
            fontFamily: 'var(--af-font-display)', fontSize: '24px',
            fontWeight: 600, color: '#fff', marginBottom: '24px',
          }}>Repository layout</div>
          <TerminalBlock title="tree — ansibleforge/">
            {[
              { text: '├── helm/', color: 'var(--af-text-muted)', comment: 'RHDP field content CI' },
              { text: '├── containers/', color: 'var(--af-blue)' },
              { text: '│   ├── tools-ansibleforge/', color: 'var(--af-blue)', comment: 'developer container' },
              { text: '│   └── ee-ansibleforge/', color: 'var(--af-blue)', comment: 'execution environment' },
              { text: '├── devspaces-template/', color: 'var(--af-amber)', comment: 'devfile template' },
              { text: '└── ocp/', color: 'var(--af-green)' },
              { text: '    ├── ansible/', color: 'var(--af-green)', comment: 'playbooks + collections' },
              { text: '    └── gitops/', color: 'var(--af-red)' },
              { text: '        ├── bootstrap/', color: 'var(--af-red)', comment: 'app-of-apps' },
              { text: '        ├── vault/', color: 'var(--af-amber)' },
              { text: '        ├── external-secrets/', color: 'var(--af-amber)' },
              { text: '        ├── shared-builds/', color: 'var(--af-text-secondary)' },
              { text: '        ├── devspaces/', color: 'var(--af-blue)' },
              { text: '        ├── user-devspace/', color: 'var(--af-blue)', comment: 'per-user helm chart' },
              { text: '        ├── pipelines/', color: 'var(--af-green)' },
              { text: '        ├── gitlab/', color: 'var(--af-green)' },
              { text: '        ├── keycloak/', color: 'var(--af-green)' },
              { text: '        └── aap/', color: 'var(--af-green)' },
            ].map((line, i) => (
              <div key={i}>
                <span style={{ color: line.color }}>{line.text}</span>
                {line.comment && <span style={{ color: 'var(--af-text-muted)' }}> # {line.comment}</span>}
              </div>
            ))}
          </TerminalBlock>
        </section>
      </main>

      <Footer />
    </div>
  )
}
