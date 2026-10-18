import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Footer, Header } from '../components/Chrome'
import Icon from '../components/Icon'
import { CONTACT } from '../data/site'

export default function Result({ ok }: { ok: boolean }) {
  return (
    <>
      <Header solid />
      <main className="result" id="main">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <span className="eyebrow">{ok ? 'Order confirmed' : 'Checkout cancelled'}</span>
          <h1 className="display" style={{ marginTop: 16 }}>
            {ok ? (
              <>
                You're on
                <br />
                <span style={{ color: 'var(--cactus)' }}>the grid.</span>
              </>
            ) : (
              <>
                No charge
                <br />
                was made.
              </>
            )}
          </h1>
          <p>
            {ok
              ? `Thanks for your order. We'll send your final proof by email and WhatsApp within one working day. Questions? Message us on ${CONTACT.whatsapp}.`
              : 'Your design is still saved in this browser tab. Head back to the configurator to finish your order whenever you are ready.'}
          </p>
          <Link to={ok ? '/' : '/configurator'} className="btn btn-primary">
            {ok ? 'Back to home' : 'Back to my design'} <Icon name="arrow" size={18} />
          </Link>
        </motion.div>
      </main>
      <Footer />
    </>
  )
}
