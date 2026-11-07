import styled from 'styled-components';

export const AssemblePlay = styled.button`
  pointer-events: auto;
  min-height: 30px;
  padding: 3px 9px;
  border: 2px solid #665025;
  border-radius: 8px;
  background: #ffe6a3;
  color: #40394e;
  font: 900 11px/1.2 sans-serif;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: #b6f0d8;
  }
  &:focus-visible {
    outline: 3px solid #ff6f9f;
    outline-offset: 3px;
  }
`;
export const OfficeDecor = styled.div`
  position: absolute;
  inset: 3px;
  border: 3px solid #edbe58;
  border-radius: 16px;
  pointer-events: none;
  background: radial-gradient(ellipse at top, #ffe49a33, transparent 65%);
  &::before {
    content: '✦  ·  ✦  ·  ✦  ·  ✦  ·  ✦';
    position: absolute;
    top: 26px;
    left: 0;
    right: 0;
    color: #ad792a;
    text-align: center;
    letter-spacing: 6px;
    font-size: 15px;
  }
  &::after {
    content: '✦';
    position: absolute;
    right: 14px;
    top: 50px;
    width: 32px;
    height: 32px;
    border: 2px solid #bf913c;
    border-radius: 50%;
    background: #fff2c6;
    color: #9b6b2e;
    text-align: center;
    font-size: 23px;
    line-height: 28px;
  }
`;
