export const DEFAULT_SOUND = 'player.wav';

export const ALERT_SOUNDS = [
    {file: 'player.wav', label: '默认'},
    {file: 'brass.wav', label: '铜管'},
    {file: 'buzzer.wav', label: '蜂鸣'},
    {file: 'coin.wav', label: '硬币'},
    {file: 'drums.wav', label: '鼓'},
    {file: 'piano.wav', label: '钢琴'},
    {file: 'pop.wav', label: '轻击'},
    {file: 'vibraphone.wav', label: '颤音琴'},
];

export function findSound(file) {
    return ALERT_SOUNDS.find(sound => sound.file === file) || null;
}
