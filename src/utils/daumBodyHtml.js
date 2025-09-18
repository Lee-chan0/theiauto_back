
import * as cheerio from 'cheerio';
import path from 'path';
import mime from 'mime-types';

/**
 * Kakao 규칙에 맞춰 bodyHtml을 정리:
 * - 첫 번째 <img>에 data-thumbnail="true" 자동 지정(이미 있으면 유지)
 * - <img alt> 없으면 기본 alt 채움
 * - 업로드한 파일명과 <img src>가 맞지 않으면(로컬 업로드 의도) src를 파일명으로 정규화
 * - 외부 URL(https://)은 그대로 두되 alt/thumbnail 규칙만 적용
 * - 불필요한 style/script 제거(안전)
 */
export function transformBodyHtmlForKakao(originalHtml = '', uploadedFiles = []) {
  const $ = cheerio.load(originalHtml, { decodeEntities: false });

  // 1) 안전: script/style 제거
  $('script, style').remove();

  // 2) 파일명 맵(빠른 매칭)
  const fileNameSet = new Set(uploadedFiles?.map(f => f.originalname));

  // 3) IMG 처리
  const $imgs = $('img');
  let hasThumb = false;

  $imgs.each((i, el) => {
    const $img = $(el);
    let src = ($img.attr('src') || '').trim();

    // alt 기본값
    if (!$img.attr('alt') || !$img.attr('alt').trim()) {
      $img.attr('alt', '이미지');
    }

    // data-thumbnail 처리
    const thumbAttr = $img.attr('data-thumbnail');
    if (!hasThumb && (!thumbAttr || thumbAttr !== 'true')) {
      // 맨 처음 이미지를 대표로 지정 (이미 true 있으면 skip)
      $img.attr('data-thumbnail', 'true');
      hasThumb = true;
    } else if (thumbAttr === 'true') {
      hasThumb = true;
    }

    // src 정규화
    // - 업로드 파일과 이름이 일치하면 그대로(또는 파일명만 남김)
    // - http/https 외부 URL은 그대로 유지(카카오가 원본을 가져가 업로드)
    // - data: URI나 blob: 등은 업로드 파일명으로 교체해야 함 → 파일명을 못찾으면 경고만
    const isHttp = /^https?:\/\//i.test(src);
    const isDataUri = /^data:/i.test(src) || /^blob:/i.test(src);

    if (fileNameSet.has(src)) {
      // 이미 업로드 파일명과 동일
      // Kakao는 <img src="파일명"> 형식도 지원하므로 그대로 둠.
      return;
    }

    if (isHttp) {
      // 외부 URL은 그대로
      return;
    }

    if (isDataUri || src === '' || src.includes('/') || src.includes('\\')) {
      // 에디터에서 들어온 data: URI / 경로 포함 src → 업로드 파일명으로 교체 시도
      // 파일명 후보: 업로드 리스트 첫 번째(대표)로 사용하거나, i번째와 매칭
      const candidate = uploadedFiles?.[i]?.originalname || uploadedFiles?.[0]?.originalname;
      if (candidate) {
        $img.attr('src', path.basename(candidate));
      } else {
        // 파일이 없으면 그대로 두되, 카카오가 접근 못 할 수 있음
        // 필요시 여기서 로그/마커 처리
      }
      return;
    }

    // src가 단순 파일명인데 업로드 리스트에 없는 경우 → 그대로 두되(외부 업로드 안 됨), 가능하면 에디터 쪽에서 파일 업로드와 맞춰야 함
  });

  // 대표 이미지가 하나도 없다면 첫 이미지에 강제 지정
  if (!hasThumb && $imgs.length > 0) {
    $($imgs.get(0)).attr('data-thumbnail', 'true');
  }

  // 4) VIDEO 처리(선택)
  $('video').each((i, el) => {
    const $v = $(el);
    const src = ($v.attr('src') || '').trim();
    if (!src) return;

    // 업로드 파일과 맞추기
    const base = path.basename(src);
    if (fileNameSet.has(base)) {
      $v.attr('src', base);
    }
    // poster가 없으면 첫 이미지 alt나 대표 이미지로 대체 가능(옵션)
    if (!$v.attr('poster') && $imgs.length > 0) {
      // 대표 이미지 찾아서 넣기
      const $thumb = $imgs.filter((_, e) => $(e).attr('data-thumbnail') === 'true').first();
      const thumbSrc = $thumb.attr('src');
      if (thumbSrc) $v.attr('poster', thumbSrc);
    }
  });

  // 5) iframe(YouTube) 허용: 그대로 두되, width/height 속성은 삭제(반응형 대응)
  $('iframe').each((_, el) => {
    const $f = $(el);
    $f.removeAttr('width');
    $f.removeAttr('height');
  });

  return $('body').length ? $('body').html() : $.root().html();
}
