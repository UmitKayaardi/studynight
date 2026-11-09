// Development-only gallery of the original art (not included in production builds).
import { Mascot, MASCOT_MOODS, MASCOT_THEMES } from '../../components/art/Mascot';
import { Avatar, AVATAR_COUNT, BadgeMedal, Logo, StormBoss } from '../../components/art/Art';
import { BADGE_IDS } from '../../lib/learning/badges';
import { TabScreen } from '../../components/layout/Shell';
import { Ring } from '../../components/ui/Controls';

export default function Gallery() {
  return (
    <TabScreen>
      <div className="flex flex-wrap gap-2 py-4">
        <Logo size={64} />
        {MASCOT_MOODS.map((m) => (
          <Mascot key={m} mood={m} size={96} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {MASCOT_THEMES.map((_, i) => (
          <Mascot key={i} theme={i} size={72} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 py-4">
        {Array.from({ length: AVATAR_COUNT }, (_, i) => (
          <Avatar key={i} index={i} size={56} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {BADGE_IDS.map((b, i) => (
          <BadgeMedal key={b} id={b} earned={i % 4 !== 3} />
        ))}
      </div>
      <div className="flex items-center gap-4 py-4">
        <StormBoss />
        <StormBoss defeated />
        <Ring value={0.66} label="66">
          {/* i18n-ignore: dev gallery */}
          66%
        </Ring>
      </div>
    </TabScreen>
  );
}
