// frontend/src/components/StatCard.jsx
import React from 'react';

const StatCard = ({ title, value, icon: Icon, color }) => {
  return (
    <div className="card" style={{ 
      padding: '1.5rem', 
      marginBottom: 0, 
      display: 'flex', 
      alignItems: 'center', 
      gap: '1rem',
      borderLeft: `4px solid ${color}` 
    }}>
      <div style={{ 
        backgroundColor: `${color}20`, 
        padding: '10px', 
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* On vérifie que Icon existe avant de l'afficher pour éviter le crash */}
        {Icon && <Icon size={24} color={color} />}
      </div>
      <div>
        <h4 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
          {title}
        </h4>
        <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
          {value}
        </span>
      </div>
    </div>
  );
};

export default StatCard;