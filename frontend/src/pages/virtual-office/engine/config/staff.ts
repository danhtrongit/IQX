import type { EmployeeProfile, Role } from '../types';


const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];
const PEOPLE: [string, boolean][] = [
  ['Minh', false], ['Lan', true], ['Hùng', false], ['Trang', true], ['Tuấn', false],
  ['Hoa', true], ['Dũng', false], ['Mai', true], ['Khoa', false], ['Linh', true],
  ['Phong', false], ['Ngọc', true], ['Quân', false], ['Thảo', true], ['Vy', true],
  ['Nam', false], ['Hà', true], ['Long', false], ['Yến', true], ['Bảo', false],
];
const ROLES = ['Môi giới', 'Chuyên viên phân tích', 'Trader', 'Tư vấn đầu tư'];
const SHIRTS = [0xf4f6fa, 0x8ecae6, 0xf4a261, 0x90be6d, 0xe76f51, 0x6c8ebf, 0xf2cc8f, 0xb5838d, 0x48cae4, 0xcdb4db];
const PANTS = [0x2b2d42, 0x3d405b, 0x22333b, 0x4a4e69];
const HAIR = [0x1b1b1b, 0x3b2a1f, 0x5a3825, 0x2c2c34];
const SKIN = [0xf1c27d, 0xe0ac69, 0xffdbac, 0xd9a066];
const TIES = [0xc0392b, 0x1f4e79, 0x2d6a4f, 0x6a4c93];
/** Index of the staff member who doubles as the IT engineer. */
const IT_INDEX = 16;

export const STAFF: EmployeeProfile[] = PEOPLE.map(([name, female], i) => {
  const role: Role = i === IT_INDEX ? 'it' : 'staff';
  return {
    name: `${SURNAMES[i % SURNAMES.length]} ${female ? 'Thị' : 'Văn'} ${name}`,
    title: role === 'it' ? 'Kỹ sư IT' : ROLES[i % ROLES.length],
    role,
    isBoss: false,
    shirt: role === 'it' ? 0x2d3142 : SHIRTS[i % SHIRTS.length],
    pants: PANTS[i % PANTS.length],
    hair: HAIR[(i * 3) % HAIR.length],
    skin: SKIN[(i * 7) % SKIN.length],
    longHair: female,
    tie: !female && i % 3 !== 2 && role !== 'it' ? TIES[i % TIES.length] : null,
  };
}).map((p) => (p.role === 'it' ? { ...p, name: p.name.replace('Thị', 'Văn').replace('Hà', 'Hải'), longHair: false } : p));

export const BOSS: EmployeeProfile = {
  name: 'Trần Quốc Đạt',
  title: 'Giám đốc chi nhánh',
  role: 'boss',
  shirt: 0x1f2a44,
  pants: 0x1a1d29,
  hair: 0x2c2c34,
  skin: 0xf1c27d,
  longHair: false,
  tie: 0xc0392b,
  isBoss: true,
};

export const RECEPTIONIST: EmployeeProfile = {
  name: 'Phạm Thu Hằng',
  title: 'Lễ tân',
  role: 'reception',
  shirt: 0xf5a623,
  pants: 0x22333b,
  hair: 0x1b1b1b,
  skin: 0xffdbac,
  longHair: true,
  tie: null,
  isBoss: false,
};

const VISITOR_NAMES = ['Ông Lý Văn Tài', 'Bà Ngô Thị Phúc', 'Anh Đỗ Minh Khang', 'Chị Trịnh Bảo Ngân', 'Ông Hồ Quang Vinh', 'Chị Mai Phương Thảo'];
const VISITOR_SHIRTS = [0x3d5a80, 0x9d0208, 0x6b705c, 0xe9c46a, 0x264653, 0xffffff];

/** Random walk-in client. */
export function makeVisitor(n: number): EmployeeProfile {
  const name = VISITOR_NAMES[n % VISITOR_NAMES.length];
  const female = name.startsWith('Bà') || name.startsWith('Chị');
  return {
    name,
    title: 'Khách hàng',
    role: 'visitor',
    shirt: VISITOR_SHIRTS[n % VISITOR_SHIRTS.length],
    pants: PANTS[(n + 1) % PANTS.length],
    hair: HAIR[n % HAIR.length],
    skin: SKIN[(n * 3) % SKIN.length],
    longHair: female,
    tie: !female && n % 2 === 0 ? TIES[n % TIES.length] : null,
    isBoss: false,
  };
}
