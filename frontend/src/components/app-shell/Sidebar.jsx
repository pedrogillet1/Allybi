import React from 'react';

const Sidebar = () => {
  return (
    <div style={{width: 84, height: '100%', background: 'white', borderRight: '1px solid #E6E6EC', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', display: 'flex'}}>
        <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 16, display: 'flex'}}>
            <div style={{padding: '20px 0', borderBottom: '1px solid #E6E6EC', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 16, display: 'flex'}}>
                <div style={{width: 44, height: 44, borderRadius: '50%', justifyContent: 'center', alignItems: 'center', display: 'flex'}}>
                    <img style={{width: 38.82, height: 38.82, borderRadius: '50%'}} src="https://placehold.co/39x39" alt="Logo" />
                </div>
                <div style={{width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <div style={{width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div style={{width: 11.54, height: 14.58, background: '#32302C'}} />
                    </div>
                </div>
            </div>
            <div style={{padding: '0 20px', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16, display: 'flex'}}>
                <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex'}}>
                    <div style={{width: 36, height: 36, background: '#F3F3F5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                        <div style={{width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            <div style={{width: 15.42, height: 13.75, background: '#32302C'}} />
                        </div>
                    </div>
                    <div style={{width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                        <div style={{width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4}}>
                            <div style={{width: 2.08, height: 2.08, background: '#6C6B6E', borderRadius: 9999}} />
                            <div style={{width: 2.08, height: 2.08, background: '#6C6B6E', borderRadius: 9999}} />
                            <div style={{width: 2.08, height: 2.08, background: '#6C6B6E', borderRadius: 9999}} />
                        </div>
                    </div>
                    <div style={{width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                        <div style={{width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            <div style={{width: 10.83, height: 16.67, borderRadius: 3.33, border: '1px solid #6C6B6E'}} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div style={{alignSelf: 'stretch', padding: '20px 0', borderTop: '1px solid #E6E6EC', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16, display: 'flex'}}>
            <div style={{width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                <div style={{width: 20, height: 20, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <div style={{width: 16, height: 16, border: '1px solid #6C6B6E', borderRadius: 2}} />
                    <div style={{width: 8, height: 8, position: 'absolute', right: 0, top: 0, background: '#D92D20', borderRadius: 9999}} />
                </div>
            </div>
            <div style={{width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                <div style={{width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <div style={{width: 5, height: 5, borderRadius: 9999, border: '1px solid #6C6B6E'}} />
                </div>
            </div>
            <div style={{width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                <div style={{width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <div style={{width: 16.25, height: 16.25, background: '#6C6B6E'}} />
                </div>
            </div>
            <img style={{width: 44, height: 44, borderRadius: '50%'}} src="https://placehold.co/44x44" alt="Avatar" />
        </div>
    </div>
  );
};

export default Sidebar;
