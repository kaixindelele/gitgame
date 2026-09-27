#!/usr/bin/env python3
"""批量离线语音合成（sherpa-onnx + Kokoro 多语言模型）。
用法: python3 tools/tts_batch.py <jobs.json> <输出目录>
jobs.json: [{"id": "s01", "lang": "zh"|"en", "text": "..."}]
输出: <输出目录>/<id>.wav 以及 durations.json {id: 秒}
模型目录由环境变量 KOKORO_DIR 指定（默认 /tmp/tts/kokoro-multi-lang-v1_0），
模型下载地址: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2
依赖: pip install sherpa-onnx soundfile
"""
import json, os, sys, hashlib
import sherpa_onnx, soundfile as sf

M = os.environ.get('KOKORO_DIR', '/tmp/tts/kokoro-multi-lang-v1_0')
VOICE = {'zh': int(os.environ.get('VOICE_ZH', 47)), 'en': int(os.environ.get('VOICE_EN', 3))}  # 47=zf_xiaoxiao, 3=af_heart
SPEED = {'zh': float(os.environ.get('SPEED_ZH', 1.0)), 'en': float(os.environ.get('SPEED_EN', 0.95))}

def build():
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=f'{M}/model.onnx', voices=f'{M}/voices.bin', tokens=f'{M}/tokens.txt',
            data_dir=f'{M}/espeak-ng-data', dict_dir=f'{M}/dict',
            lexicon=f'{M}/lexicon-us-en.txt,{M}/lexicon-zh.txt'), num_threads=4),
        rule_fsts=f'{M}/date-zh.fst,{M}/phone-zh.fst,{M}/number-zh.fst', max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)

def main():
    jobs = json.load(open(sys.argv[1]))
    out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    cache_file = os.path.join(out, 'durations.json')
    durations = json.load(open(cache_file)) if os.path.exists(cache_file) else {}
    tts = None
    for j in jobs:
        key = hashlib.sha1(f"{j['lang']}|{VOICE[j['lang']]}|{SPEED[j['lang']]}|{j['text']}".encode()).hexdigest()[:12]
        wav = os.path.join(out, f"{j['id']}.wav")
        if durations.get(j['id'], {}).get('key') == key and os.path.exists(wav):
            continue  # 缓存命中
        tts = tts or build()
        a = tts.generate(j['text'], sid=VOICE[j['lang']], speed=SPEED[j['lang']])
        sf.write(wav, a.samples, a.sample_rate)
        durations[j['id']] = {'key': key, 'sec': round(len(a.samples) / a.sample_rate, 3)}
        print(f"{j['id']}: {durations[j['id']]['sec']}s", flush=True)
    json.dump(durations, open(cache_file, 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
