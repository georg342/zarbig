# animações neo-brutalist

- durações 75–150ms. nunca >200ms.
- easing: linear ou ease-out. bounce, steps(3).
- hover: inversão sólida (bg vira --primary, texto #000). sem fade translúcido.
- :active: transform scale(0.97) OU translate(2px,2px) com box-shadow 0 0. nunca blur no shadow.
- modal/toast: slide + snap (sem bounce). fade só pra evitar tearing.
- prefers-reduced-motion: já tratado em base.css — manter.
- will-change: transform só em elementos que se movem com frequência.