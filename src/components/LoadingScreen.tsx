type LoadingScreenProps = {
  message: string
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-logo">OT</div>
        <p className="eyebrow">Firebase Sync</p>
        <h1>Preparing Workspace</h1>
        <p className="login-copy">{message}</p>
      </section>
    </main>
  )
}
