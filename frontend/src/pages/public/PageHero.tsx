export default function PageHero({ titre, sous }: { titre: string; sous: string }) {
  return (
    <section className="pub-banner">
      <div className="pub-banner-in">
        <span className="pub-eyebrow">EURAFR TOURS</span>
        <h1>{titre}</h1>
        <p>{sous}</p>
      </div>
    </section>
  );
}
