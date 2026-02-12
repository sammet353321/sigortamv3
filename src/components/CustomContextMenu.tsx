import React, { useEffect, useRef } from 'react';
import { Copy, Edit, X } from 'lucide-react';

interface CustomContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  showEdit?: boolean;
}

export default function CustomContextMenu({ x, y, onClose, onCopy, onEdit, showEdit = true }: CustomContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Adjust position if it goes off screen
  const style: React.CSSProperties = {
    top: y,
    left: x,
  };
  
  if (y + 100 > window.innerHeight) style.top = y - 100;
  if (x + 150 > window.innerWidth) style.left = x - 150;

  return (
    <div 
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-40 animate-in fade-in zoom-in-95 duration-100"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {showEdit && onEdit && (
        <button
          onClick={() => { onEdit(); onClose(); }}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 transition-colors"
        >
          <Edit size={16} />
          Düzenle
        </button>
      )}
      <button
        onClick={() => { onCopy(); onClose(); }}
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2 transition-colors"
      >
        <Copy size={16} />
        Kopyala
      </button>
    </div>
  );
}
