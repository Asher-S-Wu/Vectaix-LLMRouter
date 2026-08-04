export function PageHeading({
  title,
  description,
  action,
}: Readonly<{
  title: string;
  description: string;
  action?: React.ReactNode;
}>) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action ? <div className="heading-action">{action}</div> : null}
    </header>
  );
}
