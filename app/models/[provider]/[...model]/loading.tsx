export default function ModelDetailLoading() {
  return (
    <section aria-label="Loading model details" className="detail-page detail-skeleton-page">
      <span className="detail-skeleton-back skeleton-shimmer" />
      <div className="detail-hero skeleton-hero">
        <div className="detail-hero-main">
          <div className="detail-title-row">
            <span className="detail-provider-mark skeleton-shimmer" />
            <div>
              <span className="detail-skeleton-kicker skeleton-shimmer" />
              <span className="detail-skeleton-title skeleton-shimmer" />
            </div>
          </div>
          <span className="detail-skeleton-route skeleton-shimmer" />
          <div className="detail-meta">
            <span className="detail-skeleton-chip skeleton-shimmer" />
            <span className="detail-skeleton-chip skeleton-shimmer" />
            <span className="detail-skeleton-chip skeleton-shimmer" />
          </div>
          <div className="detail-skeleton-copy">
            <span className="skeleton-shimmer" />
            <span className="skeleton-shimmer" />
            <span className="skeleton-shimmer" />
          </div>
        </div>
        <div className="detail-actions">
          <span className="detail-skeleton-button skeleton-shimmer" />
          <span className="detail-skeleton-button skeleton-shimmer" />
        </div>
      </div>
      <div className="detail-metric-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="detail-metric-card skeleton" key={index}>
            <span className="detail-skeleton-chip skeleton-shimmer" />
            <span className="detail-skeleton-value skeleton-shimmer" />
            <span className="detail-skeleton-small skeleton-shimmer" />
          </div>
        ))}
      </div>
      <div className="detail-tabs skeleton-tabs">
        <span className="skeleton-shimmer" />
        <span className="skeleton-shimmer" />
        <span className="skeleton-shimmer" />
      </div>
      <div className="detail-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton" key={index}>
            <span className="detail-skeleton-small skeleton-shimmer" />
            <span className="detail-skeleton-value skeleton-shimmer" />
          </div>
        ))}
      </div>
    </section>
  );
}
