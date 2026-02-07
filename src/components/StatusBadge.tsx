import clsx from 'clsx';
import { TeklifDurumu, PoliceDurumu } from '@/types';

interface StatusBadgeProps {
  status: TeklifDurumu | PoliceDurumu | string;
  className?: string;
}

// 3 Ana Durum: TEKLİF (Mavi/Gri), POLİÇELEŞTİ (Yeşil), İPTAL (Kırmızı)
const getStatusConfig = (status: string) => {
    const s = status?.toLowerCase();
    
    // 1. POLİÇELEŞTİ (Yeşil)
    if (s === 'policelesti' || s === 'aktif') {
        return { label: 'POLİÇELEŞTİ', color: 'bg-green-100 text-green-700 border border-green-200' };
    }
    
    // 2. İPTAL / RED (Kırmızı)
    if (s === 'iptal' || s === 'reddedildi') {
        return { label: 'İPTAL', color: 'bg-red-100 text-red-700 border border-red-200' };
    }

    // 3. TEKLİF (Mavi - Diğer Her Şey)
    // bekliyor, islemde, hesaplandi, policelestirme_bekliyor vb.
    return { label: 'TEKLİF', color: 'bg-blue-100 text-blue-700 border border-blue-200' };
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusConfig(status);
  
  return (
    <span className={clsx(
      "px-2.5 py-0.5 rounded-full text-xs font-bold",
      config.color,
      className
    )}>
      {config.label}
    </span>
  );
}
