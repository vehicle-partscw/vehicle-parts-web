import { Zap } from 'lucide-react';
import './ComingSoonPage.css';

const ComingSoonPage = () => {
  return (
    <div className="coming-soon-page">
      <div className="section">
        <div className="coming-soon-container">
          <div className="coming-soon-icon">
            <Zap size={64} />
          </div>
          <h1>Coming Soon</h1>
          <p className="coming-soon-subtitle">
            This feature is under development. Check back soon!
          </p>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonPage;
