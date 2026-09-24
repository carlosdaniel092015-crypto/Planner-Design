// Public legal pages (the app stores ask for their URLs). Plain Spanish; review with your lawyer before publishing.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand, MUTED } from '../ui';

const UPDATED = '24 de septiembre de 2026';

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <header style={{ display: 'flex', alignItems: 'center', height: 60, padding: '0 16px', borderBottom: '2px solid var(--color-divider)' }}>
        <Brand />
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 64px', fontSize: 15, lineHeight: 1.6 }} className="legal">
        <h1 style={{ fontSize: 34, margin: '0 0 4px' }}>{title}</h1>
        <p style={{ color: MUTED, fontSize: 13, margin: '0 0 20px' }}>Última actualización: {UPDATED}</p>
        {children}
        <p style={{ marginTop: 32, fontSize: 13, color: MUTED }}>
          <Link to="/privacidad">Política de privacidad</Link> · <Link to="/terminos">Términos de uso</Link> · <Link to="/">Volver a Planner</Link>
        </p>
      </main>
      <style>{'.legal h2{font-size:20px;margin:24px 0 6px}.legal ul{padding-left:20px;margin:6px 0}'}</style>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Política de privacidad">
      <p>
        Planner es una herramienta para diseñar cocinas, closets y vestidores y presupuestarlos. La usan empresas de muebles (la «organización») con sus diseñadores, su taller y sus clientes.
        Esta política explica qué datos se guardan, para qué y qué puedes hacer con ellos.
      </p>
      <h2>Qué datos guardamos</h2>
      <ul>
        <li>
          <strong>Cuenta:</strong> nombre, correo, rol y una contraseña cifrada (nunca guardamos la contraseña en texto).
        </li>
        <li>
          <strong>Trabajo:</strong> proyectos, versiones, clientes (nombre, teléfono, correo, dirección y notas que la organización registre), texturas, modelos 3D y archivos que se suban.
        </li>
        <li>
          <strong>Aprobaciones:</strong> cuando un cliente aprueba, se guarda su nombre, correo, firma, la fecha, su dirección IP y su navegador, como constancia.
        </li>
        <li>
          <strong>Uso técnico:</strong> sesiones abiertas (dispositivo e IP) y un registro de auditoría de acciones importantes (crear, cambiar, enviar, aprobar, compartir, cambiar precios).
        </li>
        <li>
          <strong>En tu dispositivo:</strong> la app guarda una copia de tus proyectos para trabajar sin conexión; se borra al cerrar sesión.
        </li>
      </ul>
      <h2>Para qué los usamos</h2>
      <ul>
        <li>Dar el servicio: guardar y sincronizar tus diseños, calcular presupuestos, enviar enlaces de aprobación y correos de la cuenta.</li>
        <li>Seguridad: iniciar sesión, limitar intentos, detectar abusos y dejar constancia de quién hizo cada cambio.</li>
      </ul>
      <p>No vendemos datos ni los usamos para publicidad. No hay rastreadores de terceros en la app.</p>
      <h2>Quién los ve</h2>
      <ul>
        <li>Cada proyecto lo ve solo su dueño y las personas con las que lo comparte dentro de su organización.</li>
        <li>El cliente ve la propuesta mediante el enlace que se le envía.</li>
        <li>Proveedores que alojan el servicio (servidor, base de datos, almacenamiento y envío de correos) los procesan solo para prestarlo.</li>
      </ul>
      <h2>Cuánto tiempo</h2>
      <p>Mientras la cuenta o la organización estén activas. Las aprobaciones y la auditoría se conservan como constancia comercial aunque se borre una cuenta, sin sus datos personales.</p>
      <h2>Tus derechos</h2>
      <ul>
        <li>
          Ver y corregir tu nombre en <Link to="/cuenta">Mi cuenta</Link>.
        </li>
        <li>
          <strong>Borrar tu cuenta</strong> desde Mi cuenta → Borrar mi cuenta: se eliminan tus proyectos, accesos, sesiones y contraseña y se anonimizan tu nombre y correo.
        </li>
        <li>Pedir una copia o la eliminación de otros datos al administrador de tu organización.</li>
      </ul>
      <h2>Seguridad</h2>
      <p>Conexión cifrada (https), contraseñas con Argon2, sesiones que caducan y archivos validados al subirse.</p>
      <h2>Cambios</h2>
      <p>Si esta política cambia, lo verás en esta página con la fecha de actualización.</p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Términos de uso">
      <p>Al usar Planner aceptas estos términos. Si los usas en nombre de una empresa, la empresa también los acepta.</p>
      <h2>El servicio</h2>
      <p>
        Planner ayuda a diseñar muebles a medida, calcular presupuestos, generar planos y listas de corte y obtener la aprobación del cliente. Los presupuestos son estimados: la organización revisa
        medidas, precios e impuestos antes de fabricar o cobrar.
      </p>
      <h2>Tu cuenta</h2>
      <ul>
        <li>Guarda tu contraseña; eres responsable de lo que se haga con tu cuenta.</li>
        <li>El administrador de tu organización puede invitar, cambiar roles o desactivar usuarios.</li>
      </ul>
      <h2>Tu contenido</h2>
      <ul>
        <li>Los proyectos, clientes, texturas y modelos que subes siguen siendo tuyos o de tu organización.</li>
        <li>Solo subes contenido que tienes derecho a usar (por ejemplo, modelos 3D y texturas con licencia).</li>
        <li>Nos permites guardarlo y procesarlo solo para prestar el servicio.</li>
      </ul>
      <h2>Uso aceptable</h2>
      <p>No uses Planner para actividades ilegales, para enviar contenido que no es tuyo ni para intentar acceder a datos de otras organizaciones.</p>
      <h2>Aprobaciones</h2>
      <p>La aprobación de un cliente por enlace deja constancia de lo que aceptó (diseño, materiales, medidas y presupuesto) con fecha y firma. Los acuerdos comerciales son entre la organización y su cliente.</p>
      <h2>Planes y pagos</h2>
      <p>Algunas funciones pueden requerir un plan de pago. El precio y lo que incluye se muestran antes de contratarlo; puedes cancelarlo cuando quieras y conservas el acceso hasta el fin del periodo pagado.</p>
      <h2>Disponibilidad</h2>
      <p>Trabajamos para que el servicio esté siempre disponible y hacemos respaldos, pero puede haber interrupciones. La app guarda tu trabajo en el dispositivo mientras no hay conexión.</p>
      <h2>Fin del servicio</h2>
      <p>Puedes borrar tu cuenta cuando quieras desde Mi cuenta. Podemos suspender cuentas que incumplan estos términos.</p>
      <h2>Cambios</h2>
      <p>Si estos términos cambian, lo verás en esta página con la fecha de actualización.</p>
    </LegalShell>
  );
}
